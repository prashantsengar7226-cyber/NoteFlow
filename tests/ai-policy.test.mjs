import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {env} from '../.test-runtime/harness.mjs';
import {aiContext} from '../.test-runtime/ai-context.mjs';
import {weekWindow,reserveOperation,settleOperation,weeklyUsage,withAIFeature} from '../.test-runtime/ai-policy.mjs';
import {config,consumeService,ai} from '../.test-runtime/server.mjs';
import {vertexConfig,vertexGenerate} from '../.test-runtime/vertex.mjs';
import {generateKeyPairSync} from 'node:crypto';
import {z} from 'zod';
import {enqueueSummary,runNextJob,findJob,cancelJob} from '../.test-runtime/ai-jobs.mjs';
import {summaryClaims,evidenceCatalog,resolveEvidence,validateReview,alignReviewedCitations} from '../.test-runtime/summary-quality.mjs';
const originalFetch=globalThis.fetch;
beforeEach(async()=>{
  await env.DB.prepare('DELETE FROM ai_operations').run();
  await env.DB.prepare('DELETE FROM limits').run();
  await env.DB.prepare('DELETE FROM vertex_budget').run();
  env.AI_FEATURE_ROUTING='true';env.AI_PROVIDER='router';env.AI_PROVIDER_ORDER='gemini,groq,openrouter';
  env.GEMINI_API_KEY='not-free';env.GROQ_API_KEY='not-free';env.OPENROUTER_API_KEY='free-fixture';env.OPENROUTER_MODEL='openrouter/free';
  env.VERTEX_ENABLED='false';env.AI_ADMIN_USER_IDS='';
});
afterEach(()=>{globalThis.fetch=originalFetch;});

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
test('concurrent reservations cap at 20; replay, release and other owners are isolated',async()=>{
  const results=await Promise.allSettled(Array.from({length:30},(_,i)=>reserveOperation('alice',`run-${i}`,'summary')));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,20);
  await reserveOperation('alice','run-0','summary');
  assert.equal((await weeklyUsage('alice')).used,20);
  await settleOperation('alice','run-0',false);
  await reserveOperation('alice','run-0','summary');
  await assert.rejects(reserveOperation('alice','extra','insights'),e=>e.code==='WEEKLY_LIMIT');
  await reserveOperation('bob','run-0','insights');
  await settleOperation('bob','run-0',true);
  await settleOperation('bob','run-0',false);
  assert.equal((await weeklyUsage('bob')).used,1);
});
test('admin allowlist bypasses weekly allowance; personal keys and small features do not reserve it',async()=>{
  const admin='12345678-1234-1234-1234-123456789abc';env.AI_ADMIN_USER_IDS=admin;
  for(let i=0;i<25;i++)await reserveOperation(admin,`${i}`,'summary');
  assert.equal((await weeklyUsage(admin)).limit,null);
  await reserveOperation('alice','quiz','quiz');
  await aiContext.run({owner:'alice',candidate:{provider:'gemini',model:'test',key:'own'}},()=>reserveOperation('alice','personal','summary'));
  assert.equal((await weeklyUsage('alice')).used,0);
});
test('small feature calls have no daily user cap and cannot route to Vertex or paid shared models',async()=>{
  for(let i=0;i<150;i++)await consumeService('alice','ai');
  assert.deepEqual(config().candidates.map(c=>c.provider),['openrouter']);
  assert.equal(config().candidates[0].freeOnly,true);
  env.OPENROUTER_MODEL='paid/model';assert.equal(config().candidates.length,0);
  await aiContext.run({owner:'alice'},()=>withAIFeature('summary',async()=>{
    assert.equal(config().candidates.length,0);
    await assert.rejects(ai('test','test',z.object({ok:z.boolean()}),[]),e=>e.code==='VERTEX_NOT_CONFIGURED');
  }));
});
test('Vertex auth and inference use fixed hosts, global attempt cap covers admins and no fallback',async()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  Object.assign(env,{VERTEX_ENABLED:'true',VERTEX_PROJECT_ID:'test-project',VERTEX_LOCATION:'global',VERTEX_MODEL:'gemini-test',VERTEX_CREDIT_EXPIRES_AT:'2099-01-01',VERTEX_DAILY_REQUEST_CAP:'1',VERTEX_TOTAL_REQUEST_CAP:'2',VERTEX_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',client_email:'test@test-project.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})})});
  env.VERTEX_MODEL='gemini-3.5-flash';
  const urls=[];
  globalThis.fetch=async(url,init)=>{urls.push(url);assert.equal(init.redirect,'manual');if(!url.includes('oauth2'))assert.equal(JSON.parse(init.body).generationConfig.thinkingConfig.thinkingLevel,'LOW');return url.includes('oauth2')?Response.json({access_token:'fixture-token',expires_in:3600}):Response.json({candidates:[]});};
  await vertexGenerate({},1000);
  await assert.rejects(vertexGenerate({},1000),e=>e.code==='VERTEX_CAP');
  assert.equal(urls.length,2);
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
  const owner='queue-fixture',id=crypto.randomUUID();
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
    if(review)assert.deepEqual(payload.generationConfig.responseSchema.properties.claims.items.properties.sourceIds.items.enum,['0:0']);
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
