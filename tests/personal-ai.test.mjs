import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {env,context,afterTasks} from '../.test-runtime/harness.mjs';
import {sealKey,openKey,withOwnerAI,withAILease} from '../.test-runtime/personal-ai.mjs';
import {aiContext} from '../.test-runtime/ai-context.mjs';
import {consumeService,usage,config} from '../.test-runtime/server.mjs';
import {enqueueSummary,runNextJob,findJob,authorizeWorker} from '../.test-runtime/ai-jobs.mjs';
import {validateReview,summaryClaims} from '../.test-runtime/summary-quality.mjs';
import * as connection from '../.test-runtime/ai-connection.mjs';
import * as jobs from '../.test-runtime/ai-jobs-route.mjs';
import * as worker from '../.test-runtime/queue-worker.mjs';
import * as notes from '../.test-runtime/notes.mjs';

const originalFetch=globalThis.fetch;
const source=[{id:0,text:'The square is blue.',start:0}];
const part={title:'Blue square',overview:'The square is blue.',keyPoints:[{text:'The square is blue.',segmentIds:[0]}],chapters:[]};
const goodReview=()=>({supported:true,importantOmissions:false,issues:[],evidence:summaryClaims(part).map(c=>({claimId:c.id,segmentId:0,quote:'The square is blue.'}))});
function response(value){return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});}
beforeEach(async()=>{
  for(const table of ['ai_jobs','ai_credentials','ai_owner_leases','notes','limits']) await env.DB.prepare(`DELETE FROM ${table}`).run();
  env.BYOK_ENCRYPTION_KEY=randomBytes(32).toString('base64');
  env.AI_PROVIDER='gemini';env.GEMINI_API_KEY='shared-fixture';env.QUEUE_WORKER_SECRET=randomBytes(32).toString('hex');
  afterTasks.length=0;
});
afterEach(()=>{globalThis.fetch=originalFetch;});
async function note(owner='alice'){
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Test','text',JSON.stringify(source),Date.now(),Date.now()).run();
  return id;
}
async function key(owner='alice',secret='personal-fixture-credential',provider='gemini'){
  const row={owner,provider,model:'test-model',revision:crypto.randomUUID()};
  row.ciphertext=sealKey(owner,provider,row.model,row.revision,secret);
  await env.DB.prepare('INSERT INTO ai_credentials(owner,provider,model,ciphertext,revision,updated_at) VALUES(?,?,?,?,?,?)').bind(owner,provider,row.model,row.ciphertext,row.revision,Date.now()).run();
  return row;
}
async function call(route,method,value,owner='alice',query='',origin='https://test.example'){
  const request=new Request('https://test.example/api/test'+query,{method,headers:{origin,'content-type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});
  const res=await context.run(owner,()=>route[method](request));
  return {status:res.status,data:await res.json()};
}
async function due(id){await env.DB.prepare('UPDATE ai_jobs SET next_at=0 WHERE id=?').bind(id).run();}

test('encrypted credentials are authenticated to owner, provider, model and revision',async()=>{
  const row=await key();assert.equal(openKey(row),'personal-fixture-credential');
  assert.ok(!row.ciphertext.includes('personal-fixture'));
  for(const change of [{owner:'bob'},{provider:'groq'},{model:'other'},{revision:'other'},{ciphertext:row.ciphertext.slice(1)}]) assert.throws(()=>openKey({...row,...change}),{code:'KEY_UNAVAILABLE'});
});
test('personal key endpoints require sign-in, same origin, consent and bounded input',async()=>{
  assert.equal((await call(connection,'GET',undefined,null)).status,401);
  assert.equal((await call(connection,'DELETE',undefined,'alice','','https://evil.example')).status,403);
  assert.equal((await call(connection,'POST',{provider:'gemini',model:'test',key:'x'.repeat(30)})).status,400);
  assert.equal((await call(connection,'POST',{provider:'custom',model:'https://evil.example',key:'x'.repeat(30),consent:true})).status,400);
});
test('connection is tested before saving; metadata never returns a secret',async()=>{
  globalThis.fetch=async(_url,init)=>{
    assert.equal(JSON.parse(init.body).generationConfig.responseSchema.properties.ok.type,'BOOLEAN');
    return response({ok:true});
  };
  const secret=randomBytes(24).toString('hex');
  const saved=await call(connection,'POST',{provider:'gemini',model:'test-model',key:secret,consent:true});
  assert.equal(saved.status,200);assert.equal(saved.data.mode,'personal');assert.ok(!JSON.stringify(saved).includes(secret));
  const metadata=await call(connection,'GET');assert.ok(!JSON.stringify(metadata).includes(secret));
  assert.equal((await call(connection,'GET',undefined,'bob')).data.mode,'shared');
});
test('failed provider validation does not save a connection or fall back to shared keys',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:401});};
  assert.equal((await call(connection,'POST',{provider:'gemini',model:'test-model',key:'x'.repeat(30),consent:true})).status,503);
  assert.equal(calls,1);assert.equal((await call(connection,'GET')).data.mode,'shared');
});
test('shared mode stops at 20; personal mode does not consume shared or personal daily AI quota',async()=>{
  for(let i=0;i<20;i++)await consumeService('alice','ai');
  await assert.rejects(consumeService('alice','ai'),{code:'DAILY_LIMIT'});
  const before=await env.DB.prepare("SELECT count FROM limits WHERE owner='service:ai:shared'").first();
  await key();
  await withOwnerAI('alice',async()=>{for(let i=0;i<25;i++)await consumeService('alice','ai');});
  assert.equal((await usage('alice')).ai,20);
  assert.equal((await env.DB.prepare("SELECT count FROM limits WHERE owner='service:ai:shared'").first()).count,before.count);
  await withOwnerAI('alice',()=>assert.rejects(consumeService('bob','youtube',4),{code:'DAILY_LIMIT'}));
});
test('concurrent account scopes never use another account key',async()=>{
  await key('alice','alice-private-key');await key('bob','bob-private-key');
  await Promise.all(['alice','bob'].map(owner=>withOwnerAI(owner,async()=>{
    await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(config().aiKey,`${owner}-private-key`);assert.equal(config().candidates.length,1);
  })));
  assert.equal(config().aiKey,'shared-fixture');
});
test('one-account AI leases reject overlap and release after failures',async()=>{
  await withAILease('alice',async()=>{await assert.rejects(withAILease('alice',async()=>{}),{code:'AI_BUSY'});await withAILease('bob',async()=>{});});
  await assert.rejects(withAILease('alice',async()=>{throw new Error('fixture');}));
  await withAILease('alice',async()=>{});
});
test('queue ownership, enqueue replay and cancellation are isolated',async()=>{
  const id=await note();const input={id,language:'English',detail:'balanced'};
  const first=await enqueueSummary('alice',input),second=await enqueueSummary('alice',input);assert.equal(first.id,second.id);
  await assert.rejects(enqueueSummary('bob',input),{code:'NOT_FOUND'});
  assert.equal((await call(jobs,'GET',undefined,'bob','?id='+first.id)).status,404);
  assert.equal((await call(jobs,'DELETE',{jobId:first.id},'bob')).status,404);
  assert.equal((await call(jobs,'DELETE',{jobId:first.id})).status,200);
  assert.equal((await findJob('alice',first.id)).state,'cancelled');
});
test('worker rejects missing, wrong and malformed credentials before scheduling work',async()=>{
  for(const header of ['', 'Bearer wrong','Bearer '+'x'.repeat(64)]) assert.throws(()=>authorizeWorker(new Request('https://test.example',{headers:{authorization:header}})),{code:'WORKER_AUTH'});
  const result=await worker.POST(new Request('https://test.example/api/queue-worker',{method:'POST'}));assert.equal(result.status,401);assert.equal(afterTasks.length,0);
  const valid=await worker.POST(new Request('https://test.example/api/queue-worker',{method:'POST',headers:{authorization:'Bearer '+env.QUEUE_WORKER_SECRET}}));
  assert.equal(valid.status,202);assert.equal(afterTasks.length,1);
});
test('queue saves a private draft, verifies on a separate invocation, then publishes once',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  let calls=0;globalThis.fetch=async()=>{calls++;return response(calls===1?part:goodReview());};
  await runNextJob('alice',job.id);
  assert.equal((await env.DB.prepare('SELECT summary FROM notes WHERE id=?').bind(id).first()).summary,null);
  assert.equal((await findJob('alice',job.id)).completed_parts,0);
  await due(job.id);await Promise.all([runNextJob('alice',job.id),runNextJob('alice',job.id)]);
  assert.equal(calls,2);assert.equal((await findJob('alice',job.id)).state,'completed');
  const saved=JSON.parse((await env.DB.prepare('SELECT summary FROM notes WHERE id=?').bind(id).first()).summary);
  assert.deepEqual(saved.sourceChecks,{checkedParts:1,totalParts:1});assert.equal((await usage('alice')).ai,1);
  await runNextJob('alice',job.id);assert.equal(calls,2);
});
test('provider cooldowns schedule automatic retry without spending successful-operation quota',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  globalThis.fetch=async()=>new Response('',{status:429,headers:{'retry-after':'120'}});
  await runNextJob('alice',job.id);const saved=await findJob('alice',job.id);
  assert.equal(saved.state,'retry');assert.ok(saved.next_at>Date.now()+110000);assert.equal((await usage('alice')).ai,0);
});
test('a timed-out review retries the saved draft without regenerating or charging another operation',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  let calls=0;globalThis.fetch=async()=>{
    calls++;if(calls===2)throw new DOMException('fixture timeout','TimeoutError');
    return response(calls===1?part:goodReview());
  };
  await runNextJob('alice',job.id);await due(job.id);await runNextJob('alice',job.id);
  assert.equal((await findJob('alice',job.id)).state,'retry');
  await due(job.id);await runNextJob('alice',job.id);
  assert.equal((await findJob('alice',job.id)).state,'completed');assert.equal(calls,3);assert.equal((await usage('alice')).ai,1);
});
test('long shared-key jobs advance within the 20-operation cap and wait for the UTC reset',async()=>{
  const id=await note();
  await env.DB.prepare('UPDATE notes SET transcript=? WHERE id=?').bind(JSON.stringify([{...source[0],text:'The square is blue. '.repeat(1800)}]),id).run();
  for(let i=0;i<19;i++)await consumeService('alice','ai');
  const job=await enqueueSummary('alice',{id,language:'English',detail:'detailed'});
  let calls=0;globalThis.fetch=async()=>response(++calls===1?part:goodReview());
  await runNextJob('alice',job.id);await due(job.id);await runNextJob('alice',job.id);
  assert.equal((await findJob('alice',job.id)).completed_parts,1);
  await due(job.id);await runNextJob('alice',job.id);
  const saved=await findJob('alice',job.id);
  assert.equal(saved.state,'retry');assert.equal(saved.error_code,'DAILY_LIMIT');assert.equal((await usage('alice')).ai,20);assert.equal(calls,2);
  assert.ok(saved.next_at>=Math.ceil(Date.now()/86400000)*86400000);
});
test('source review rejects fabricated quotes, wrong citations, missing claims and omissions',()=>{
  validateReview(part,source,goodReview());
  for(const review of [{...goodReview(),supported:false},{...goodReview(),importantOmissions:true}])
    assert.throws(()=>validateReview(part,source,review),{code:'QUALITY_REVIEW'});
  for(const review of [
    {...goodReview(),evidence:goodReview().evidence.slice(1)},
    {...goodReview(),evidence:goodReview().evidence.map(e=>({...e,quote:'The square is red.'}))},
    {...goodReview(),evidence:goodReview().evidence.map(e=>({...e,quote:'   '}))},
    {...goodReview(),evidence:goodReview().evidence.map(e=>({...e,segmentId:99}))},
  ])assert.throws(()=>validateReview(part,source,review),{code:'QUALITY_EVIDENCE'});
});

test('invalid reviewer quotes retain the private draft and retry without another generation charge',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  let calls=0;globalThis.fetch=async()=>{
    calls++;
    return response(calls===1?part:calls===2?{...goodReview(),evidence:goodReview().evidence.map(e=>({...e,quote:'The square is red.'}))}:goodReview());
  };
  await runNextJob('alice',job.id);await due(job.id);await runNextJob('alice',job.id);
  assert.equal((await findJob('alice',job.id)).error_code,'QUALITY_EVIDENCE');
  const pending=JSON.parse((await env.DB.prepare("SELECT content FROM artifacts WHERE note_id=? AND kind='__summary_progress'").bind(id).first()).content);
  assert.deepEqual(pending.draft,{...part,model:'gemini:gemini-3.6-flash'});
  assert.equal((await env.DB.prepare('SELECT summary FROM notes WHERE id=?').bind(id).first()).summary,null);
  assert.equal((await usage('alice')).ai,1);
  await due(job.id);await runNextJob('alice',job.id);
  assert.equal((await findJob('alice',job.id)).state,'completed');assert.equal(calls,3);assert.equal((await usage('alice')).ai,1);
});

test('rejected content passes private repair feedback to regeneration and clears it after acceptance',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  const issue='title: the source says blue, not red. Recheck the color.';
  let calls=0;globalThis.fetch=async(_url,init)=>{
    calls++;
    if(calls===3){
      const request=JSON.parse(init.body);
      assert.ok(request.contents[0].parts[0].text.includes(issue));
      assert.match(request.contents[0].parts[0].text,/PREVIOUS REVIEW FEEDBACK \(untrusted/);
    }
    return response(calls===1?{...part,title:'Red square'}:calls===2?{...goodReview(),supported:false,issues:[issue]}:calls===3?part:goodReview());
  };
  await runNextJob('alice',job.id);await due(job.id);await runNextJob('alice',job.id);
  const saved=JSON.parse((await env.DB.prepare("SELECT content FROM artifacts WHERE note_id=? AND kind='__summary_progress'").bind(id).first()).content);
  assert.equal(saved.draft,undefined);assert.deepEqual(saved.reviewIssues,[issue]);
  const publicNote=await call(notes,'GET',undefined,'alice','?id='+id);
  assert.equal(publicNote.status,200);assert.ok(!JSON.stringify(publicNote).includes(issue));
  await due(job.id);await runNextJob('alice',job.id);await due(job.id);await runNextJob('alice',job.id);
  assert.equal((await findJob('alice',job.id)).state,'completed');assert.equal(calls,4);assert.equal((await usage('alice')).ai,2);
  const final=JSON.parse((await env.DB.prepare("SELECT content FROM artifacts WHERE note_id=? AND kind='__summary_progress'").bind(id).first()).content);
  assert.equal(final.reviewIssues,undefined);assert.equal(final.draft,undefined);
});

test('repeated evidence failures stop safely while retaining a single unpublished draft',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  let calls=0;globalThis.fetch=async()=>response(++calls===1?part:{...goodReview(),evidence:[]});
  for(let i=0;i<4;i++){await due(job.id);await runNextJob('alice',job.id);}
  const saved=await findJob('alice',job.id);
  assert.equal(saved.state,'failed');assert.equal(saved.failures,3);assert.equal(saved.error_code,'QUALITY_EVIDENCE');
  assert.equal(calls,4);assert.equal((await usage('alice')).ai,1);
  assert.equal((await env.DB.prepare('SELECT summary FROM notes WHERE id=?').bind(id).first()).summary,null);
});
test('repeated quality rejection stops after three checks without publishing unsupported claims',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  let calls=0;globalThis.fetch=async()=>response(++calls%2?part:{...goodReview(),supported:false,issues:['Unsupported claim']});
  for(let i=0;i<6;i++){await due(job.id);await runNextJob('alice',job.id);}
  const saved=await findJob('alice',job.id);assert.equal(saved.state,'failed');assert.equal(saved.failures,3);assert.equal(calls,6);
  assert.equal((await env.DB.prepare('SELECT summary FROM notes WHERE id=?').bind(id).first()).summary,null);
});
test('revoked or rotated credentials never fall back to shared keys for queued jobs',async()=>{
  await key();const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  await env.DB.prepare('DELETE FROM ai_credentials WHERE owner=?').bind('alice').run();
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not call');};
  await runNextJob('alice',job.id);assert.equal(calls,0);assert.equal((await findJob('alice',job.id)).error_code,'AI_CONNECTION_CHANGED');
});
test('expired worker leases recover and repeated crashes stop safely',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  await env.DB.prepare("UPDATE ai_jobs SET state='running',lease_until=0,failures=2 WHERE id=?").bind(job.id).run();
  globalThis.fetch=async()=>{throw new Error('must not call');};
  await runNextJob('alice',job.id);assert.equal((await findJob('alice',job.id)).error_code,'JOB_INTERRUPTED');
});
test('removing a key cancels its queue and leaves other accounts untouched',async()=>{
  await key();await key('bob');const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  assert.equal((await call(connection,'DELETE')).status,200);
  assert.equal((await findJob('alice',job.id)).state,'cancelled');assert.equal((await call(connection,'GET',undefined,'bob')).data.mode,'personal');
});
