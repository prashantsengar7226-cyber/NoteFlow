import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {env,context} from '../.test-runtime/harness.mjs';
import * as workspace from '../.test-runtime/workspace.mjs';
import {aiContext} from '../.test-runtime/ai-context.mjs';
import {weekWindow,reserveOperation,settleOperation,weeklyUsage,withAIFeature,usesVertex} from '../.test-runtime/ai-policy.mjs';
import {config,consumeService,ai} from '../.test-runtime/server.mjs';
import {vertexConfig,vertexGenerate} from '../.test-runtime/vertex.mjs';
import {generateKeyPairSync} from 'node:crypto';
import {z} from 'zod';
import {enqueueSummary,runNextJob,drainJobs,findJob,cancelJob} from '../.test-runtime/ai-jobs.mjs';
import {summaryClaims,evidenceCatalog,resolveEvidence,validateReview,alignReviewedCitations,repairSummaryPart,checkSummaryPart} from '../.test-runtime/summary-quality.mjs';
import {summaryTrialEnabled} from '../.test-runtime/summary-trial.mjs';
import {summarySourceChunks} from '../.test-runtime/study.mjs';
const originalFetch=globalThis.fetch;
test('paid boundary rejects anonymous, regular, unknown-feature and personal-key callers without fetching',async()=>{
  env.AI_FEATURE_ROUTING='true';
  const admin='12345678-1234-1234-1234-123456789abc';env.AI_ADMIN_USER_IDS=admin;
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Unexpected paid request');};
  await assert.rejects(vertexGenerate({},1000),e=>e.code==='VERTEX_ADMIN_ONLY');
  for(const scope of [{owner:'regular-user',feature:'summary'},
    {owner:admin,role:'admin',feature:'unknown'}, {owner:admin,role:'admin',feature:'summary',candidate:{provider:'gemini',key:'personal',model:'test'}}]) {
    await aiContext.run(scope,async()=>{
      assert.equal(usesVertex(),false);
      await assert.rejects(vertexGenerate({},1000),e=>e.code==='VERTEX_ADMIN_ONLY');
      if(!scope.candidate)assert.deepEqual(config().candidates.map(c=>c.provider),['gemini']);
    });
  }
  assert.equal(calls,0);
  await aiContext.run({owner:admin,role:'admin',feature:'insights'},async()=>assert.equal(usesVertex(),true));
});
beforeEach(async()=>{
  delete env.VERTEX_TOOLS_MODEL;
  await env.DB.prepare("INSERT INTO user_access(owner,role,suspended,revision,updated_by,updated_at) VALUES(?,'admin',0,?,'test',?) ON CONFLICT(owner) DO UPDATE SET role='admin',suspended=0").bind('12345678-1234-1234-1234-123456789abc',crypto.randomUUID(),Date.now()).run();
  await env.DB.prepare('DELETE FROM ai_operations').run();
  await env.DB.prepare('DELETE FROM limits').run();
  await env.DB.prepare('DELETE FROM vertex_budget').run();
  env.AI_FEATURE_ROUTING='true';env.AI_PROVIDER='router';env.AI_PROVIDER_ORDER='gemini,groq,openrouter';
  env.GEMINI_API_KEY='not-free';env.GROQ_API_KEY='not-free';env.OPENROUTER_API_KEY='free-fixture';env.OPENROUTER_MODEL='openrouter/free';
  env.VERTEX_ENABLED='false';env.AI_ADMIN_USER_IDS='';env.GEMINI_FREE_API_KEY='gemini-free-fixture';env.GEMINI_FREE_TIER_CONFIRMED='true';
});

test('admin interactive tools use a separate Vertex model and never the free circuit',async()=>{
 const owner='12345678-1234-1234-1234-123456789abc';
 Object.assign(env,{VERTEX_ENABLED:'true',VERTEX_PROJECT_ID:'test-project',VERTEX_LOCATION:'global',VERTEX_MODEL:'gemini-3.8-flash',VERTEX_CREDIT_EXPIRES_AT:'2099-01-01',VERTEX_SERVICE_ACCOUNT_JSON:'configured'});
 for(const role of ['admin','superuser'])for(const feature of ['chat','quiz','flashcards','mindmap','slides','translation']){
  await aiContext.run({owner,role,feature},async()=>{
   assert.equal(usesVertex(),true);assert.equal(config().aiKey,'vertex-server-auth');
   assert.equal(vertexConfig().model,'gemini-3.1-flash-lite');
  });
 }
 await aiContext.run({owner,role:'admin',feature:'summary'},async()=>assert.equal(vertexConfig().model,'gemini-3.8-flash'));
 env.VERTEX_TOOLS_MODEL='gemini-custom';
 await aiContext.run({owner,role:'admin',feature:'chat'},async()=>assert.equal(vertexConfig().model,'gemini-custom'));
 await env.DB.prepare("UPDATE user_access SET role='user' WHERE owner=?").bind(owner).run();
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected fetch');};
 await aiContext.run({owner,role:'admin',feature:'chat'},()=>assert.rejects(vertexGenerate({},1000),e=>e.code==='VERTEX_ADMIN_ONLY'));
 assert.equal(calls,0);
});
afterEach(()=>{globalThis.fetch=originalFetch;delete env.SUMMARY_LARGE_BATCHES;delete env.SUMMARY_PIPELINE_TRIAL;delete env.VERCEL;});

test('regular workspace and queued revision review stay free even with Vertex configured',async()=>{
  const owner='regular-free-fixture',id=crypto.randomUUID();
  env.AI_ADMIN_USER_IDS='12345678-1234-1234-1234-123456789abc';
  const source=[{id:0,start:0,text:'The square is blue.'}];
  const part={title:'Blue square',overview:'The square is blue.',keyPoints:[{text:'The square is blue.',segmentIds:[0]}],chapters:[]};
  await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Test','text',JSON.stringify(source),Date.now(),Date.now()).run();
  for(const feature of ['summary','insights','quiz','flashcards','mindmap','slides','translation','chat']) {
    await aiContext.run({owner,feature},async()=>{
      assert.equal(usesVertex(),false);
      assert.equal(config().candidates[0].key,'gemini-free-fixture');assert.equal(config().candidates[0].fallbackModel,undefined);
    });
  }
  const status=await context.run(owner,()=>workspace.GET(new Request('https://test.example/api/workspace')));
  const data=await status.json();assert.equal(data.vertex,false);assert.equal(data.summaryConnection.provider,'Gemini · free tier');assert.equal(data.dailyLimits.ai,null);
  let calls=0;
  globalThis.fetch=async(url,init)=>{
    assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');assert.equal(init.headers['x-goog-api-key'],'gemini-free-fixture');calls++;
    const request=JSON.parse(init.body);
    assert.equal(request.generationConfig.thinkingConfig.thinkingLevel,'low');
    const value=calls===1?part:{claims:summaryClaims(part).map(c=>({claimId:c.id,sourceIds:['0:0'],reason:'',verdict:'supported'})),omissions:[]};
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});
  };
  const job=await enqueueSummary(owner,{id,language:'English',detail:'detailed'});
  await runNextJob(owner,job.id);
  await env.DB.prepare('UPDATE ai_jobs SET next_at=0 WHERE id=?').bind(job.id).run();
  await runNextJob(owner,job.id);
  assert.equal((await findJob(owner,job.id)).state,'completed');assert.equal(calls,2);
  assert.equal((await weeklyUsage(owner)).used,0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM vertex_budget').first()).n,0);
});

test('Vertex evidence IDs resolve exact Unicode text and reject unknown or mismatched citations',()=>{
  const source=[{id:7,start:0,text:'सही संख्या 540 पुस्तकें है। '.repeat(30)},{id:8,start:1,text:'खरीद अभी प्रस्तावित है।'}];
  const catalog=evidenceCatalog(source);
  assert.equal(catalog.filter(p=>p.segmentId===7).map(p=>p.quote).join(''),source[0].text);
  assert.ok(catalog.every(p=>source.find(s=>s.id===p.segmentId).text.includes(p.quote)));
  const part={title:'पुस्तकें',overview:'सही संख्या 540 पुस्तकें है।',keyPoints:[{text:'540 पुस्तकें',segmentIds:[7]}],chapters:[]};
  const review={supported:true,importantOmissions:false,issues:[],evidence:summaryClaims(part).map(c=>({claimId:c.id,sourceIds:['0:0']}))};
  assert.doesNotThrow(()=>validateReview(part,source,resolveEvidence(review,catalog)));
  assert.throws(()=>resolveEvidence({...review,evidence:[{claimId:'title',sourceIds:['missing']}]},catalog),e=>e.code==='QUALITY_EVIDENCE');
  assert.throws(()=>validateReview(part,source,resolveEvidence({...review,evidence:review.evidence.map(e=>e.claimId==='point:0'?{...e,sourceIds:['1:0']}:e)},catalog)),e=>e.code==='QUALITY_EVIDENCE');
  assert.throws(()=>validateReview(part,source,resolveEvidence({...review,supported:false},catalog)),e=>e.code==='QUALITY_REVIEW');
  const wrong={...part,keyPoints:[{...part.keyPoints[0],segmentIds:[8]}]};
  const resolved=resolveEvidence(review,catalog);
  const aligned=alignReviewedCitations(wrong,resolved);
  assert.deepEqual(aligned.keyPoints[0].segmentIds,[7]);
  assert.equal(aligned.keyPoints[0].text,wrong.keyPoints[0].text);
  assert.doesNotThrow(()=>validateReview(aligned,source,resolved));
  assert.equal(alignReviewedCitations(wrong,{...resolved,supported:false}),wrong);
});
test('weekly IST boundary is Monday midnight, including year rollover',()=>{
  assert.equal(new Date(weekWindow(Date.parse('2026-10-25T18:30:00Z')).start).toISOString(),'2026-10-25T18:30:00.000Z');
  assert.equal(new Date(weekWindow(Date.parse('2026-10-25T18:29:59Z')).resetAt).toISOString(),'2026-10-25T18:30:00.000Z');
  assert.equal(new Date(weekWindow(Date.parse('2027-01-01T00:00:00Z')).start).toISOString(),'2026-12-27T18:30:00.000Z');
});
test('free revision guides do not reserve a weekly paid allowance',async()=>{
  const results=await Promise.allSettled(Array.from({length:30},(_,i)=>reserveOperation('alice',`run-${i}`,'summary')));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,30);
  await reserveOperation('alice','run-0','summary');
  assert.equal((await weeklyUsage('alice')).used,0);
  await settleOperation('alice','run-0',false);
  await reserveOperation('alice','run-0','summary');
  await reserveOperation('alice','extra','insights');
  await reserveOperation('bob','run-0','insights');
  await settleOperation('bob','run-0',true);
  await settleOperation('bob','run-0',false);
  assert.equal((await weeklyUsage('bob')).used,0);
});
test('database admin role bypasses weekly allowance; personal keys and small features do not reserve it',async()=>{
  const admin='12345678-1234-1234-1234-123456789abc';env.AI_ADMIN_USER_IDS=admin;
  for(let i=0;i<25;i++)await reserveOperation(admin,`${i}`,'summary');
  assert.equal((await weeklyUsage(admin)).limit,null);
  await reserveOperation('alice','quiz','quiz');
  await aiContext.run({owner:'alice',candidate:{provider:'gemini',model:'test',key:'own'}},()=>reserveOperation('alice','personal','summary'));
  assert.equal((await weeklyUsage('alice')).used,0);
});
test('small feature calls have no daily user cap and cannot route to Vertex or paid shared models',async()=>{
  for(let i=0;i<150;i++)await consumeService('alice','ai');
  assert.deepEqual(config().candidates.map(c=>c.provider),['gemini']);
  assert.equal(config().candidates[0].key,'gemini-free-fixture');assert.equal(config().candidates[0].fallbackModel,undefined);
  env.GEMINI_FREE_TIER_CONFIRMED='false';assert.equal(config().candidates.length,0);
  await aiContext.run({owner:'alice'},()=>withAIFeature('summary',async()=>{
    assert.equal(config().candidates.length,0);
    await assert.rejects(ai('test','test',z.object({ok:z.boolean()}),[]),e=>e.code==='AI_NOT_CONFIGURED');
  }));
});
test('Vertex auth uses fixed hosts; database admins bypass product caps but attempts remain metered',async()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  Object.assign(env,{VERTEX_ENABLED:'true',VERTEX_PROJECT_ID:'test-project',VERTEX_LOCATION:'global',VERTEX_MODEL:'gemini-test',VERTEX_CREDIT_EXPIRES_AT:'2099-01-01',VERTEX_DAILY_REQUEST_CAP:'1',VERTEX_TOTAL_REQUEST_CAP:'2',VERTEX_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',client_email:'test@test-project.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})})});
  env.VERTEX_MODEL='gemini-3.5-flash';
  const urls=[];
  globalThis.fetch=async(url,init)=>{urls.push(url);assert.equal(init.redirect,'manual');if(!url.includes('oauth2'))assert.equal(JSON.parse(init.body).generationConfig.thinkingConfig.thinkingLevel,'LOW');return url.includes('oauth2')?Response.json({access_token:'fixture-token',expires_in:3600}):Response.json({candidates:[]});};
  const owner='12345678-1234-1234-1234-123456789abc';env.AI_ADMIN_USER_IDS=owner;
  await aiContext.run({owner,role:'admin',feature:'summary'},async()=>{
    await vertexGenerate({},1000);
    await vertexGenerate({},1000);
    assert.equal((await env.DB.prepare('SELECT total_count FROM vertex_budget').first()).total_count,2);
  });
  assert.equal(urls.length,3);
  assert.equal(urls[1],'https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/google/models/gemini-3.5-flash:generateContent');
  env.VERTEX_CREDIT_EXPIRES_AT='2020-01-01';assert.throws(vertexConfig,e=>e.code==='VERTEX_NOT_CONFIGURED');
});
test('personal gcloud credentials cannot enable Vertex on Vercel',()=>{
  Object.assign(env,{VERCEL:'1',VERTEX_SERVICE_ACCOUNT_JSON:'',VERTEX_ALLOW_LOCAL_ADC:'true',VERTEX_LOCAL_ADC_PATH:'local.json'});
  try { assert.throws(vertexConfig,e=>e.code==='VERTEX_NOT_CONFIGURED'); }
  finally { delete env.VERCEL;delete env.VERTEX_ALLOW_LOCAL_ADC;delete env.VERTEX_LOCAL_ADC_PATH; }
});
test('queued Vertex generation and review count once; replay is free and cancellation refunds',async()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  Object.assign(env,{VERTEX_ENABLED:'true',VERTEX_PROJECT_ID:'queue-project',VERTEX_LOCATION:'global',VERTEX_MODEL:'gemini-test',VERTEX_CREDIT_EXPIRES_AT:'2099-01-01',VERTEX_DAILY_REQUEST_CAP:'10',VERTEX_TOTAL_REQUEST_CAP:'10',VERTEX_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',client_email:'queue@queue-project.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})})});
  const owner='12345678-1234-1234-1234-123456789abc',id=crypto.randomUUID();env.AI_ADMIN_USER_IDS=owner;
  const source=[{id:0,text:'The square is blue.',start:0}];
  const part={title:'Blue square',overview:'The square is blue.',keyPoints:[{text:'The square is blue.',segmentIds:[0]}],chapters:[]};
  await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Test','text',JSON.stringify(source),Date.now(),Date.now()).run();
  let calls=0;
  globalThis.fetch=async(url,init)=>{
    if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'synthetic',expires_in:3600});
    assert.ok(url.startsWith('https://aiplatform.googleapis.com/'));calls++;
    const payload=JSON.parse(init.body);
    const review=payload.systemInstruction.parts[0].text.includes('skeptical source reviewer');
    assert.equal(payload.generationConfig.maxOutputTokens,16384);
    if(review){
      const claims=payload.generationConfig.responseSchema.properties.claims;
      assert.deepEqual(claims.items.properties.sourceIds.items.enum,['0:0']);
      assert.equal(claims.items.properties.sourceIds.minItems,1);
      assert.deepEqual(claims.items.propertyOrdering,['claimId','sourceIds','reason','verdict']);
      assert.equal(claims.minItems,undefined);assert.equal(claims.maxItems,undefined);
    }
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(review?{claims:summaryClaims(part).map(c=>({claimId:c.id,verdict:'supported',reason:'',sourceIds:['0:0']})),omissions:[]}:part)}]}}]});
  };
  const job=await enqueueSummary(owner,{id,language:'English',detail:'balanced'});
  await runNextJob(owner,job.id);
  assert.equal((await weeklyUsage(owner)).used,1);
  await env.DB.prepare('UPDATE ai_jobs SET next_at=0 WHERE id=?').bind(job.id).run();
  await runNextJob(owner,job.id);
  assert.equal((await findJob(owner,job.id)).state,'completed');
  assert.equal((await weeklyUsage(owner)).used,1);assert.equal(calls,2);
  await runNextJob(owner,job.id);assert.equal(calls,2);
  const another=await enqueueSummary(owner,{id,language:'Hindi',detail:'balanced'});
  await reserveOperation(owner,another.id,'summary');
  assert.equal((await weeklyUsage(owner)).used,2);
  await cancelJob(owner,another.id);assert.equal((await weeklyUsage(owner)).used,1);
});

test('one worker invocation drafts and reviews a free summary without a cron delay',async()=>{
 const owner='burst-fixture',id=crypto.randomUUID();
 const part={title:'Square',overview:'The square is blue.',keyPoints:[{text:'The square is blue.',segmentIds:[0]}],chapters:[]};
 await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Test','text',JSON.stringify([{id:0,start:0,text:'The square is blue.'}]),Date.now(),Date.now()).run();
 let calls=0;globalThis.fetch=async()=>{calls++;const value=calls===1?part:{claims:summaryClaims(part).map(c=>({claimId:c.id,sourceIds:['0:0'],reason:'',verdict:'supported'})),omissions:[]};return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});};
 const job=await enqueueSummary(owner,{id,language:'English',detail:'balanced'});
 assert.equal(await drainJobs(owner,job.id),2);
 assert.equal((await findJob(owner,job.id)).state,'completed');assert.equal(calls,2);
 assert.equal(await drainJobs(owner,job.id),0);assert.equal(calls,2);
});

test('Gemini-only queue completes every transcript part, including its tail; quota never triggers another model',async()=>{
 const owner='gemini-long-fixture',id=crypto.randomUUID();
 const source=Array.from({length:12},(_,i)=>({id:i,start:i*60,text:('The square is blue. '.repeat(500))+(i===11?'The final exam is on 15 November.':'')}));
 const total=summarySourceChunks(source,'balanced').length;assert.ok(total>6);
 await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Long source','text',JSON.stringify(source),Date.now(),Date.now()).run();
 let calls=0,part,seenTail=false;
 globalThis.fetch=async(url,init)=>{
   assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');calls++;
   const payload=JSON.parse(init.body),review=payload.systemInstruction.parts[0].text.includes('skeptical source reviewer');
   const content=payload.contents[0].parts[0].text;
   if(!review){const current=content.split('CURRENT PART:\n')[1]||content;seenTail ||= current.includes('final exam');const first=Number(current.match(/\[(\d+)\]/)[1]);part={title:'Square',overview:'The square is blue.',keyPoints:[{text:'The square is blue.',segmentIds:[first]}],chapters:[]};}
   const value=review?{claims:summaryClaims(part).map(c=>({claimId:c.id,sourceIds:['0:0'],reason:'',verdict:'supported'})),omissions:[]}:part;
   return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});
 };
 const job=await enqueueSummary(owner,{id,language:'English',detail:'balanced'});
 assert.equal(await drainJobs(owner,job.id)+await drainJobs(owner,job.id),total*2);
 const done=await findJob(owner,job.id);assert.equal(done.state,'completed');assert.equal(done.completed_parts,total);assert.equal(calls,total*2);assert.equal(seenTail,true);
 calls=0;globalThis.fetch=async url=>{calls++;assert.ok(url.includes('generativelanguage.googleapis.com'));return Response.json({error:{status:'RESOURCE_EXHAUSTED'}},{status:429,headers:{'retry-after':'60'}});};
 await aiContext.run({owner,feature:'summary'},()=>assert.rejects(ai('test','test',z.object({ok:z.boolean()}),[]),e=>e.code==='PROVIDER_LIMIT'));
 assert.equal(calls,1);
});

test('worker uses remaining time and deadline handoffs do not become provider backoff',async()=>{
 env.SUMMARY_LARGE_BATCHES='true'; const owner='deadline-performance',id=crypto.randomUUID();
 await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Clock test','text',JSON.stringify([{id:0,start:0,text:'The square is blue.'}]),Date.now(),Date.now()).run();
 const job=await enqueueSummary(owner,{id,language:'English',detail:'balanced'});
 let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('No call expected');};
 await runNextJob(owner,job.id,Date.now()+1000);
 const yielded=await findJob(owner,job.id);
 assert.equal(yielded.error_code,'WORKER_YIELD');assert.equal(yielded.failures,0);assert.ok(yielded.next_at<=Date.now());assert.equal(calls,0);
 const originalNow=Date.now;let clock=originalNow();
 const part={title:'Square',overview:'The square is blue.',keyPoints:[{text:'The square is blue.',segmentIds:[0]}],chapters:[]};
 try {
  Date.now=()=>clock;
  globalThis.fetch=async()=>{calls++;clock+=calls===1?80000:1000;const value=calls===1?part:{claims:summaryClaims(part).map(c=>({claimId:c.id,sourceIds:['0:0'],reason:'',verdict:'supported'})),omissions:[]};return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});};
  assert.equal(await drainJobs(owner,job.id),2);
  assert.equal((await findJob(owner,job.id)).state,'completed');assert.equal(calls,2);
 } finally {Date.now=originalNow;}
});

test('changing large-batch flag preserves the saved plan and checked coverage on resume',async()=>{
 const owner='large-plan-resume',id=crypto.randomUUID();
 const source=[{id:0,start:0,text:'The square is blue. '.repeat(1900)}];
 assert.ok(summarySourceChunks(source,'balanced',3).length>1);
 assert.equal(summarySourceChunks(source,'balanced',4).length,1);
 await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Test','text',JSON.stringify(source),Date.now(),Date.now()).run();
 const part={title:'Square',overview:'The square is blue.',keyPoints:[{text:'The square is blue.',segmentIds:[0]}],chapters:[]};
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(calls===1?part:{claims:summaryClaims(part).map(c=>({claimId:c.id,sourceIds:['0:0'],reason:'',verdict:'supported'})),omissions:[]})}]}}]});};
 try {
  env.SUMMARY_LARGE_BATCHES='true';
  const job=await enqueueSummary(owner,{id,language:'English',detail:'balanced'});
  await runNextJob(owner,job.id);
  const row=await env.DB.prepare("SELECT content FROM artifacts WHERE note_id=? AND kind='__summary_progress'").bind(id).first();
  assert.equal(JSON.parse(row.content).chunkVersion,4);
  env.SUMMARY_LARGE_BATCHES='false';
  await runNextJob(owner,job.id);
  const done=await findJob(owner,job.id);assert.equal(done.state,'completed');assert.equal(done.total_parts,1);assert.equal(calls,2);
 } finally {delete env.SUMMARY_LARGE_BATCHES;}
});

test('targeted repairs preserve supported claims and reject edits outside the review plan',async()=>{
 const part={title:'Library',overview:'Library rules.',keyPoints:[{text:'Borrow for 14 days.',segmentIds:[0]},{text:'Fee is 20 rupees.',segmentIds:[1]}],chapters:[],sourceChecked:true};
 const source=[{id:0,start:0,text:'Borrow for 14 days.'},{id:1,start:1,text:'The late fee is 2 rupees.'}];
 const patch={claimId:'point:1',text:'The late fee is 2 rupees.',heading:'',segmentIds:[1]};
 const execute=async value=>{
  globalThis.fetch=async()=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});
  return aiContext.run({owner:'repair-test',feature:'summary'},()=>repairSummaryPart(part,source,'English',['Correct the fee.'],{claimIds:['point:1'],omissions:false}));
 };
 const fixed=await execute({patches:[patch],additions:[]});
 assert.equal(fixed.title,part.title);assert.equal(fixed.overview,part.overview);assert.deepEqual(fixed.keyPoints[0],part.keyPoints[0]);
 assert.equal(fixed.keyPoints[1].text,patch.text);assert.equal(part.keyPoints[1].text,'Fee is 20 rupees.');assert.equal(fixed.sourceChecked,undefined);
 await assert.rejects(execute({patches:[{...patch,claimId:'point:0'}],additions:[]}),{code:'QUALITY_EVIDENCE'});
 await assert.rejects(execute({patches:[{...patch,segmentIds:[999]}],additions:[]}),{code:'INVALID_CITATION'});
 await assert.rejects(execute({patches:[patch],additions:[{text:'Invented addition',segmentIds:[0]}]}),{code:'INVALID_AI_OUTPUT'});
});

test('queued targeted repair is checkpointed and never published before its independent review',async()=>{
 env.SUMMARY_LARGE_BATCHES='true'; const owner='targeted-queue',id=crypto.randomUUID();
 const source=[{id:0,start:0,text:'Borrow for 14 days.'},{id:1,start:1,text:'The late fee is 2 rupees.'}];
 const part={title:'Library',overview:'Borrowing rules.',keyPoints:[{text:'Borrow for 14 days.',segmentIds:[0]},{text:'Late fee is 20 rupees.',segmentIds:[1]}],chapters:[]};
 await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Test','text',JSON.stringify(source),Date.now(),Date.now()).run();
 let calls=0;
 globalThis.fetch=async(url,init)=>{
  calls++;const system=JSON.parse(init.body).systemInstruction.parts[0].text;
  let value=part;
  if(calls===3){assert.match(system,/Repair rejected claims only/);value={patches:[{claimId:'point:1',text:'Late fee is 2 rupees.',heading:'',segmentIds:[1]}],additions:[]};}
  else if(calls===2||calls===4){value={claims:summaryClaims(part).filter(c=>calls!==4||c.id==='point:1').map(c=>({claimId:c.id,sourceIds:[c.id==='point:1'?'1:0':'0:0'],reason:calls===2&&c.id==='point:1'?'Fee must be 2 rupees.':'',verdict:calls===2&&c.id==='point:1'?'unsupported':'supported'})),omissions:[]};}
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});
 };
 const job=await enqueueSummary(owner,{id,language:'English',detail:'balanced'});
 await runNextJob(owner,job.id);await runNextJob(owner,job.id);
 assert.equal((await findJob(owner,job.id)).error_code,'QUALITY_REVIEW');
 await env.DB.prepare('UPDATE ai_jobs SET next_at=0 WHERE id=?').bind(job.id).run();
 await runNextJob(owner,job.id);
 assert.equal((await findJob(owner,job.id)).completed_parts,0);
 const staged=JSON.parse((await env.DB.prepare("SELECT content FROM artifacts WHERE note_id=? AND kind='__summary_progress'").bind(id).first()).content);
 assert.equal(staged.draft.keyPoints[0].text,part.keyPoints[0].text);assert.equal(staged.draft.keyPoints[1].text,'Late fee is 2 rupees.');
 await runNextJob(owner,job.id);assert.equal((await findJob(owner,job.id)).state,'completed');assert.equal(calls,4);
});

test('repeated large-batch review failures preserve the checked prefix and split only remaining source',async()=>{
 const owner='adaptive-queue',id=crypto.randomUUID();
 const source=Array.from({length:12},(_,i)=>({id:i,start:i,text:'The square is blue. '.repeat(500)}));
 const chunks=summarySourceChunks(source,'balanced',4);assert.ok(chunks.length>1);
 await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Test','text',JSON.stringify(source),Date.now(),Date.now()).run();
 let calls=0,current;
 globalThis.fetch=async()=>{
  calls++;const first=calls<=2?chunks[0][0].id:chunks[1][0].id;
  current={title:'Square',overview:'The square is blue.',keyPoints:[{text:'The square is blue.',segmentIds:[first]}],chapters:[]};
  let value=current;
  if(calls===5)value={patches:[{claimId:'point:0',text:'The square is blue.',heading:'',segmentIds:[first]}],additions:[]};
  if([2,4,6].includes(calls))value={claims:summaryClaims(current).filter(c=>calls!==6||c.id==='point:0').map(c=>({claimId:c.id,sourceIds:['0:0'],reason:calls>2&&c.id==='point:0'?'Unresolved ambiguity.':'',verdict:calls>2&&c.id==='point:0'?'unsupported':'supported'})),omissions:[]};
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});
 };
 try{
  env.SUMMARY_LARGE_BATCHES='true';const job=await enqueueSummary(owner,{id,language:'English',detail:'balanced'});
  await runNextJob(owner,job.id);await runNextJob(owner,job.id);
  const read=async()=>JSON.parse((await env.DB.prepare("SELECT content FROM artifacts WHERE note_id=? AND kind='__summary_progress'").bind(id).first()).content);
  const prefix=(await read()).parts;
  for(let i=0;i<4;i++)await runNextJob(owner,job.id);
  const progress=await read();assert.equal(progress.chunkVersion,3);assert.deepEqual(progress.legacyPrefix,{version:4,count:1});assert.deepEqual(progress.parts,prefix);
  assert.equal(progress.draft,undefined);assert.equal(progress.repairPlan,undefined);
  assert.equal(progress.totalParts,1+summarySourceChunks(chunks.slice(1).flat(),'balanced',3).length);
  const state=await findJob(owner,job.id);assert.equal(state.error_code,'WORKER_YIELD');assert.equal(state.state,'retry');assert.equal(state.failures,1);
 }finally{delete env.SUMMARY_LARGE_BATCHES;}
});

test('accepted review evidence is reused only for unchanged claims and identical source context',async()=>{
 const part={title:'Library',overview:'Borrowing rules.',keyPoints:[{text:'Borrow for 14 days.',segmentIds:[0]},{text:'Fee is 20 rupees.',segmentIds:[1]}],chapters:[]};
 const source=[{id:0,start:0,text:'Library borrowing rules: borrow for 14 days.'},{id:1,start:1,text:'Fee is 2 rupees.'}];
 let reject=true,requested=[];
 globalThis.fetch=async(url,init)=>{
  const content=JSON.parse(init.body).contents[0].parts[0].text;
  const start=content.indexOf('{'),end=content.indexOf('\nCURRENT SOURCE:');const request=JSON.parse(content.slice(start,end));requested=request.claims.map(c=>c.id);
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({claims:request.claims.map(c=>({claimId:c.id,sourceIds:[c.id==='point:1'?'1:0':'0:0'],reason:reject&&c.id==='point:1'?'Wrong fee.':'',verdict:reject&&c.id==='point:1'?'unsupported':'supported'})),omissions:[]})}]}}]});
 };
 const run=(value,src,cache,boundary='')=>aiContext.run({owner:'review-cache',feature:'summary'},()=>checkSummaryPart(value,src,boundary,'balanced',undefined,cache));
 let cache;await assert.rejects(run(part,source),e=>{cache=e.accepted;return e.code==='QUALITY_REVIEW'&&cache.claims.length===3;});
 reject=false;
 const corrected={...part,keyPoints:[part.keyPoints[0],{text:'Fee is 2 rupees.',segmentIds:[1]}]};
 assert.equal((await run(corrected,source,cache)).sourceChecked,true);assert.deepEqual(requested,['point:1']);
 await run({...corrected,title:'Changed title'},source,cache);assert.deepEqual(requested,['title','point:1']);
 await run(corrected,[{...source[0],text:source[0].text+' New source detail.'},source[1]],cache);assert.equal(requested.length,4);
 await run(corrected,source,cache,'Changed boundary context');assert.equal(requested.length,4);
});

test('production summary trial is database-role gated and rollback overrides all flags',async()=>{
 env.VERCEL='1';env.SUMMARY_LARGE_BATCHES='true';
 const admin='12345678-1234-1234-1234-123456789abc';
 assert.equal(await summaryTrialEnabled(admin),false);
 env.SUMMARY_PIPELINE_TRIAL='admins';
 assert.equal(await summaryTrialEnabled(admin),true);
 await aiContext.run({owner:'ordinary',role:'superuser'},async()=>assert.equal(await summaryTrialEnabled('ordinary'),false));
 await env.DB.prepare("UPDATE user_access SET role='user' WHERE owner=?").bind(admin).run();
 assert.equal(await summaryTrialEnabled(admin),false);
 await env.DB.prepare("INSERT INTO user_access(owner,role,suspended,revision,updated_by,updated_at) VALUES('trial-superuser','superuser',0,'trial','test',0)").run();
 assert.equal(await summaryTrialEnabled('trial-superuser'),true);
 env.SUMMARY_PIPELINE_TRIAL='off';assert.equal(await summaryTrialEnabled(admin),false);
});

test('trial rollback discards unchecked large drafts and retains a resumable smaller plan',async()=>{
 const owner='rollback-plan',id=crypto.randomUUID(),source=[{id:0,start:0,text:'The square is blue. '.repeat(1900)}];
 await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Test','text',JSON.stringify(source),Date.now(),Date.now()).run();
 let calls=0;globalThis.fetch=async(url,init)=>{calls++;assert.ok(!JSON.parse(init.body).systemInstruction.parts[0].text.includes('skeptical source reviewer'));return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({title:'Square',overview:'The square is blue.',keyPoints:[{text:'The square is blue.',segmentIds:[0]}],chapters:[]})}]}}]});};
 env.SUMMARY_LARGE_BATCHES='true';const job=await enqueueSummary(owner,{id,language:'English',detail:'balanced'});await runNextJob(owner,job.id);
 env.VERCEL='1';env.SUMMARY_PIPELINE_TRIAL='off';await runNextJob(owner,job.id);
 const progress=JSON.parse((await env.DB.prepare("SELECT content FROM artifacts WHERE note_id=? AND kind='__summary_progress'").bind(id).first()).content);
 assert.equal(progress.chunkVersion,3);assert.deepEqual(progress.legacyPrefix,{version:4,count:0});assert.ok(progress.totalParts>1);assert.equal(progress.parts.length,0);assert.equal(calls,2);
});
