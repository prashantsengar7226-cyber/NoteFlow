import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {env,context,afterTasks} from '../.test-runtime/harness.mjs';
import {sealKey,openKey,withOwnerAI,withAILease} from '../.test-runtime/personal-ai.mjs';
import {aiContext} from '../.test-runtime/ai-context.mjs';
import {consumeService,usage,config} from '../.test-runtime/server.mjs';
import {enqueueSummary,runNextJob,findJob,authorizeWorker} from '../.test-runtime/ai-jobs.mjs';
import {validateReview,summaryClaims,reviewSchema,SummaryQualityError} from '../.test-runtime/summary-quality.mjs';
import * as connection from '../.test-runtime/ai-connection.mjs';
import * as jobs from '../.test-runtime/ai-jobs-route.mjs';
import * as worker from '../.test-runtime/queue-worker.mjs';
import * as notes from '../.test-runtime/notes.mjs';
import * as models from '../.test-runtime/ai-models-route.mjs';
import {listModels} from '../.test-runtime/ai-models.mjs';
import {jobMessage,queuedSummary} from '../.test-runtime/queue-client.mjs';
import {sourceNotes,asMarkdown} from '../.test-runtime/core.mjs';

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
async function savedSummary(id){return JSON.parse((await env.DB.prepare('SELECT summary FROM notes WHERE id=?').bind(id).first()).summary);}

test('source notes are bounded original excerpts across the transcript and exports label them honestly',()=>{
  const source=Array.from({length:204},(_,id)=>({id,start:id*10,text:`मूल स्रोत ${id} 😀 `+'लंबा पाठ। '.repeat(200)}));
  const notes=sourceNotes(source,'Source fixture','TIMEOUT');
  assert.equal(notes.engine,'extractive');assert.equal(notes.keyPoints.length,12);
  assert.equal(notes.keyPoints[0].segmentIds[0],0);assert.equal(notes.keyPoints.at(-1).segmentIds[0],203);
  for(const point of notes.keyPoints){assert.ok(source[point.segmentIds[0]].text.startsWith(point.text.replace(/ …$/,'')));assert.ok(!point.text.includes('\uFFFD'));}
  assert.ok(Buffer.byteLength(JSON.stringify(notes))<60000);assert.equal(notes.sourceChecks,undefined);
  assert.match(asMarkdown('Title',notes),/Selected source excerpts/);
  assert.match(notes.overview,/not an AI-written summary/);
});

test('provider limits produce usable source notes without spending quota and retain the recovery schedule',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'Hindi',detail:'balanced'});
  let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'300'}});};
  await runNextJob('alice',job.id);
  const result=await savedSummary(id),state=await findJob('alice',job.id);
  assert.equal(result.engine,'extractive');assert.equal(result.language,'Source language');assert.equal(result.fallback.reason,'PROVIDER_LIMIT');
  assert.equal(state.state,'retry');assert.ok(state.next_at>Date.now()+290000);assert.equal(calls,1);assert.equal((await usage('alice')).ai,0);
  assert.equal((await call(notes,'GET',undefined,'bob','?id='+id)).status,404);
  await runNextJob('alice',job.id);assert.equal(calls,1);
});

test('source notes work at the shared daily cap with no AI request and never overwrite an existing AI result',async()=>{
  const id=await note();for(let i=0;i<20;i++)await consumeService('alice','ai');
  const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  globalThis.fetch=async()=>{throw new Error('No provider request allowed');};
  await runNextJob('alice',job.id);assert.equal((await savedSummary(id)).fallback.reason,'DAILY_LIMIT');assert.equal((await usage('alice')).ai,20);
  const ai={...part,engine:'ai',language:'English'};
  await env.DB.prepare('UPDATE notes SET summary=? WHERE id=?').bind(JSON.stringify(ai),id).run();
  await due(job.id);await runNextJob('alice',job.id);assert.deepEqual(await savedSummary(id),ai);
});

test('cancellation during an AI call prevents the fallback from overwriting the note',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  globalThis.fetch=async()=>{await call(jobs,'DELETE',{jobId:job.id});return new Response('',{status:429});};
  await runNextJob('alice',job.id);assert.equal((await findJob('alice',job.id)).state,'cancelled');assert.equal((await savedSummary(id)).fallback.reason,'AI_PENDING');
});

test('client returns labelled source notes during cooldown without kicking or marking AI complete',async()=>{
  const summary=sourceNotes(source,'Test','PROVIDER_LIMIT');let calls=0;
  const job={id:crypto.randomUUID(),noteId:'note',state:'retry',errorCode:'PROVIDER_LIMIT',nextAt:Date.now()+300000};
  globalThis.fetch=async(path)=>{calls++;return Response.json(path==='/api/ai-jobs'?{job}:{note:{summary}});};
  assert.deepEqual(await queuedSummary('note',{language:'Hindi',detail:'balanced'},()=>{}),summary);assert.equal(calls,2);
});

test('source notes are available while the first provider request is still pending',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  let release,started;const began=new Promise(resolve=>started=resolve);
  globalThis.fetch=async()=>{started();return new Promise(resolve=>release=()=>resolve(response(part)));};
  const running=runNextJob('alice',job.id);
  await began;
  try{assert.equal((await savedSummary(id)).fallback.reason,'AI_PENDING');assert.equal((await findJob('alice',job.id)).state,'running');}
  finally{release();await running;}
  assert.equal((await findJob('alice',job.id)).completed_parts,0);
});

test('encrypted credentials are authenticated to owner, provider, model and revision',async()=>{
  const row=await key();assert.equal(openKey(row),'personal-fixture-credential');
  assert.ok(!row.ciphertext.includes('personal-fixture'));
  for(const change of [{owner:'bob'},{provider:'groq'},{model:'other'},{revision:'other'},{ciphertext:row.ciphertext.slice(1)}]) assert.throws(()=>openKey({...row,...change}),{code:'KEY_UNAVAILABLE'});
});

test('catalogs use fixed authenticated hosts, paginate Gemini, and filter non-text models',async()=>{
  const secret='catalog-fixture-private-key';let pages=0;
  globalThis.fetch=async(url,init)=>{
    assert.equal(url.origin,'https://generativelanguage.googleapis.com');assert.equal(init.headers['x-goog-api-key'],secret);
    assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.ok(!url.href.includes(secret));
    pages++;
    return Response.json(pages===1?{models:[{name:'models/first',displayName:'First',supportedGenerationMethods:['generateContent'],inputTokenLimit:32000},{name:'models/embed',supportedGenerationMethods:['embedContent']}],nextPageToken:'next'}:{models:[{name:'models/second',supportedGenerationMethods:['generateContent']},{name:'models/first',supportedGenerationMethods:['generateContent']}]});
  };
  assert.deepEqual((await listModels('gemini',secret)).map(m=>m.id).sort(),['first','second']);assert.equal(pages,2);
  globalThis.fetch=async(url,init)=>{assert.equal(url.href,'https://api.groq.com/openai/v1/models');assert.equal(init.headers.Authorization,'Bearer '+secret);return Response.json({data:[{id:'chat',active:true,context_window:8192},{id:'inactive',active:false},{id:'whisper-large-v3',active:true}]});};
  assert.equal((await listModels('groq',secret)).length,1);
  globalThis.fetch=async(url)=>{assert.equal(url.href,'https://openrouter.ai/api/v1/models/user');return Response.json({data:[{id:'vendor/free',name:'Free',architecture:{input_modalities:['text'],output_modalities:['text']},pricing:{prompt:'0',completion:'0'}},{id:'image',architecture:{input_modalities:['text'],output_modalities:['image']}}]});};
  assert.equal((await listModels('openrouter',secret))[0].free,true);
});

test('catalog endpoint is owner-bound, same-origin, rate-limited and never persists or returns keys',async()=>{
  const row=await key(),secret=openKey(row);let requests=0;
  globalThis.fetch=async(_url,init)=>{requests++;assert.equal(init.headers['x-goog-api-key'],secret);return Response.json({models:[{name:'models/test-model',displayName:secret,supportedGenerationMethods:['generateContent']}]});};
  const payload={provider:'gemini',revision:row.revision};
  assert.equal((await call(models,'POST',payload,null)).status,401);
  assert.equal((await call(models,'POST',payload,'alice','','https://evil.example')).status,403);
  assert.equal((await call(models,'POST',payload,'bob')).status,409);
  assert.equal((await call(models,'POST',{...payload,owner:'alice'},'bob')).status,400);
  assert.equal((await call(models,'POST',{provider:'groq',revision:row.revision})).status,409);
  const listed=await call(models,'POST',payload);assert.equal(listed.status,200);assert.ok(!JSON.stringify(listed).includes(secret));
  assert.equal(requests,1);
  for(let i=0;i<4;i++)await call(models,'POST',payload);
  assert.equal((await call(models,'POST',payload)).status,429);
  assert.equal(openKey(await env.DB.prepare('SELECT * FROM ai_credentials WHERE owner=?').bind('alice').first()),secret);
});

test('catalog failures are sanitized and never fall back to a public or shared-key list',async()=>{
  for(const [upstream,status] of [[401,422],[403,422],[429,429],[500,503]]){
    let calls=0;globalThis.fetch=async()=>{calls++;return new Response('private-upstream-secret',{status:upstream});};
    await assert.rejects(listModels('openrouter','catalog-fixture-private-key'),e=>e.status===status&&!e.message.includes('private-upstream'));assert.equal(calls,1);
  }
  globalThis.fetch=async()=>Response.json({unexpected:'private-upstream-secret'});
  await assert.rejects(listModels('gemini','catalog-fixture-private-key'),{code:'MODEL_CATALOG_UNAVAILABLE'});
});

test('saved-key model changes test first, rebind ciphertext and cancel only the owner’s old jobs',async()=>{
  const row=await key();const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  const otherId=await note('bob');const other=await enqueueSummary('bob',{id:otherId,language:'English',detail:'balanced'});
  let calls=0;globalThis.fetch=async(url)=>{calls++;assert.ok(String(url).includes('new-model'));return response({ok:true});};
  assert.equal((await call(connection,'POST',{provider:'gemini',model:'new-model',revision:row.revision,consent:true},'bob')).status,409);assert.equal(calls,0);
  const updated=await call(connection,'POST',{provider:'gemini',model:'new-model',revision:row.revision,consent:true});assert.equal(updated.status,200);
  const saved=await env.DB.prepare('SELECT * FROM ai_credentials WHERE owner=?').bind('alice').first();
  assert.equal(saved.model,'new-model');assert.equal(openKey(saved),'personal-fixture-credential');assert.notEqual(saved.ciphertext,row.ciphertext);assert.notEqual(saved.revision,row.revision);
  assert.equal((await findJob('alice',job.id)).state,'cancelled');assert.equal((await findJob('bob',other.id)).state,'queued');
  assert.equal((await call(connection,'POST',{provider:'gemini',model:'new-model',revision:row.revision,consent:true})).status,409);assert.equal(calls,1);
});

test('saving the unchanged model keeps its revision and queued work without spending a test call',async()=>{
  const row=await key(),id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  globalThis.fetch=async()=>{throw new Error('No provider call expected');};
  const result=await call(connection,'POST',{provider:'gemini',model:row.model,revision:row.revision,consent:true});
  assert.equal(result.status,200);assert.equal(result.data.revision,row.revision);assert.equal((await findJob('alice',job.id)).state,'queued');
});

test('failed model tests preserve connection; concurrent removal cannot be undone by saved-key changes',async()=>{
  const row=await key();const payload={provider:'gemini',model:'new-model',revision:row.revision,consent:true};
  globalThis.fetch=async()=>new Response('',{status:401});
  assert.equal((await call(connection,'POST',payload)).status,503);
  assert.equal((await credentialRow()).revision,row.revision);
  globalThis.fetch=async()=>{await env.DB.prepare('DELETE FROM ai_credentials WHERE owner=?').bind('alice').run();return response({ok:true});};
  assert.equal((await call(connection,'POST',payload)).status,409);assert.equal(await credentialRow(),null);
  async function credentialRow(){return env.DB.prepare('SELECT * FROM ai_credentials WHERE owner=?').bind('alice').first();}
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
  assert.equal((await savedSummary(id)).engine,'extractive');
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
  assert.equal((await savedSummary(id)).engine,'extractive');
  assert.equal((await usage('alice')).ai,1);
  await due(job.id);await runNextJob('alice',job.id);
  assert.equal((await findJob('alice',job.id)).state,'completed');assert.equal(calls,3);assert.equal((await usage('alice')).ai,1);
});

test('review retries receive missing-claim feedback without publishing or regenerating the draft',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  let calls=0;globalThis.fetch=async(_url,init)=>{
    calls++;
    if(calls===3)assert.match(JSON.parse(init.body).contents[0].parts[0].text,/Missing evidence for claim IDs: title, overview/);
    return response(calls===1?part:calls===2?{...goodReview(),evidence:goodReview().evidence.filter(e=>e.claimId.startsWith('point:'))}:goodReview());
  };
  await runNextJob('alice',job.id);await due(job.id);await runNextJob('alice',job.id);
  const pending=JSON.parse((await env.DB.prepare("SELECT content FROM artifacts WHERE note_id=? AND kind='__summary_progress'").bind(id).first()).content);
  assert.ok(pending.draft);assert.match(pending.evidenceIssues[0],/title, overview/);
  assert.equal((await savedSummary(id)).engine,'extractive');
  const publicNote=await call(notes,'GET',undefined,'alice','?id='+id);
  assert.ok(!JSON.stringify(publicNote.data).includes('evidenceIssues'));
  await due(job.id);await runNextJob('alice',job.id);
  assert.equal((await findJob('alice',job.id)).state,'completed');assert.equal(calls,3);assert.equal((await usage('alice')).ai,1);
  const final=JSON.parse((await env.DB.prepare("SELECT content FROM artifacts WHERE note_id=? AND kind='__summary_progress'").bind(id).first()).content);
  assert.equal(final.evidenceIssues,undefined);
});

test('verbose review rejection reaches repair instead of retrying the same draft as invalid output',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  // Production Gemini reviews exceeded 300 characters, especially for Hindi.
  const issue='title: '+ 'स्रोत में नीला रंग है, लाल रंग का दावा समर्थित नहीं है। '.repeat(8)+'Correct the title to blue.';
  assert.ok(issue.length>300 && issue.length<2000);
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
  assert.equal((await findJob('alice',job.id)).error_code,'QUALITY_REVIEW');
  assert.ok((await findJob('alice',job.id)).next_at < Date.now()+20000);
  const saved=JSON.parse((await env.DB.prepare("SELECT content FROM artifacts WHERE note_id=? AND kind='__summary_progress'").bind(id).first()).content);
  assert.equal(saved.draft,undefined);assert.deepEqual(saved.reviewIssues,[issue]);
  const publicNote=await call(notes,'GET',undefined,'alice','?id='+id);
  assert.equal(publicNote.status,200);assert.ok(!JSON.stringify(publicNote.data).includes(issue));
  await due(job.id);await runNextJob('alice',job.id);await due(job.id);await runNextJob('alice',job.id);
  assert.equal((await findJob('alice',job.id)).state,'completed');assert.equal(calls,4);assert.equal((await usage('alice')).ai,2);
  const final=JSON.parse((await env.DB.prepare("SELECT content FROM artifacts WHERE note_id=? AND kind='__summary_progress'").bind(id).first()).content);
  assert.equal(final.reviewIssues,undefined);assert.equal(final.draft,undefined);
});

test('verbose negative reviews remain rejections and their stored repair context is bounded',()=>{
  const review=reviewSchema.parse({...goodReview(),issues:Array.from({length:20},()=> 'x'.repeat(6000))});
  assert.throws(()=>validateReview(part,source,review),error=>{
    assert.ok(error instanceof SummaryQualityError);
    assert.equal(error.issues.length,12);assert.ok(error.issues.every(issue=>issue.length===2000));
    assert.ok(!error.message.includes('xxx'));return true;
  });
  assert.equal(reviewSchema.safeParse({...goodReview(),issues:[{message:'unsupported'}]}).success,false);
});

test('queue messages distinguish provider quota, correction work and invalid responses',()=>{
  const job={state:'retry',nextAt:Date.now(),errorCode:'PROVIDER_LIMIT'};
  assert.match(jobMessage(job),/provider's quota or rate limit/);
  assert.match(jobMessage({...job,errorCode:'QUALITY_REVIEW'}),/Automatic repair/);
  assert.match(jobMessage({...job,state:'failed',errorCode:'INVALID_AI_OUTPUT'}),/unusable response/);
  assert.match(jobMessage({...job,state:'failed',errorCode:'QUALITY_EVIDENCE'}),/Source checks/);
  assert.match(jobMessage({...job,state:'failed',errorCode:'TIMEOUT'}),/provider repeatedly timed out/);
});

test('repeated evidence failures stop safely while retaining a single unpublished draft',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  let calls=0;globalThis.fetch=async()=>response(++calls===1?part:{...goodReview(),evidence:[]});
  for(let i=0;i<4;i++){await due(job.id);await runNextJob('alice',job.id);}
  const saved=await findJob('alice',job.id);
  assert.equal(saved.state,'failed');assert.equal(saved.failures,3);assert.equal(saved.error_code,'QUALITY_EVIDENCE');
  assert.equal(calls,4);assert.equal((await usage('alice')).ai,1);
  assert.equal((await savedSummary(id)).engine,'extractive');
});
test('repeated quality rejection stops after three checks without publishing unsupported claims',async()=>{
  const id=await note();const job=await enqueueSummary('alice',{id,language:'English',detail:'balanced'});
  let calls=0;globalThis.fetch=async()=>response(++calls%2?part:{...goodReview(),supported:false,issues:['Unsupported claim']});
  for(let i=0;i<6;i++){await due(job.id);await runNextJob('alice',job.id);}
  const saved=await findJob('alice',job.id);assert.equal(saved.state,'failed');assert.equal(saved.failures,3);assert.equal(calls,6);
  assert.equal((await savedSummary(id)).engine,'extractive');
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
