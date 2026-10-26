// Explicit live opt-in. Synthetic text, or an authorized local note fixture;
// all application state stays in temporary in-memory SQLite.
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import {env} from '../.test-runtime/harness.mjs';
import {enqueueSummary,runNextJob,findJob} from '../.test-runtime/ai-jobs.mjs';
import {weeklyUsage} from '../.test-runtime/ai-policy.mjs';
const local=parseEnv(await readFile('.env.local','utf8'));
const originalFetch=globalThis.fetch;
globalThis.fetch=async(...args)=>{
 const response=await originalFetch(...args);
 if(response.status===400 && String(args[0]).startsWith('https://aiplatform.googleapis.com/')){
  const data=await response.clone().json().catch(()=>({}));
  let message=String(data.error?.message||'');
  for(const value of Object.values(local))if(value.length>8)message=message.replaceAll(value,'[redacted]');
  console.warn(JSON.stringify({providerSchemaError:message.slice(0,1600)}));
 }
 return response;
};
Object.assign(env,{AI_FEATURE_ROUTING:'true',VERTEX_ENABLED:'true',VERTEX_PROJECT_ID:local.VERTEX_PROJECT_ID,VERTEX_SERVICE_ACCOUNT_JSON:local.VERTEX_SERVICE_ACCOUNT_JSON,VERTEX_LOCATION:'global',VERTEX_MODEL:process.argv.find(x=>x.startsWith('--model='))?.slice(8)||'gemini-3.8-flash',VERTEX_CREDIT_EXPIRES_AT:'2027-01-18T00:00:00Z',VERTEX_DAILY_REQUEST_CAP:process.argv.includes('--note')?'60':'8',VERTEX_TOTAL_REQUEST_CAP:process.argv.includes('--note')?'60':'8'});
const owner='12345678-1234-1234-1234-123456789abc',id=crypto.randomUUID();
env.AI_ADMIN_USER_IDS=owner; // Temporary harness only; never changes the production allowlist.
const englishSegments=[{id:0,start:0,text:'A classroom experiment compared two groups of ten students. Group A practiced recall on Monday and Thursday. Group B reread the lesson only on Thursday.'},{id:1,start:30,text:'On Friday, Group A averaged eight correct answers out of ten. Group B averaged six. This small experiment does not prove that spaced practice works for everyone.'}];
const fixture = process.argv.includes('--note') ? JSON.parse(await readFile(process.argv.includes('--resume-test')?'audit/production/real-note-test-progress.json':'audit/production/current-note-review-fixture.json','utf8')) : null;
const segments = fixture?.segments ?? (process.argv.includes('--hindi') ? JSON.parse(await readFile('tests/fixtures/hindi-facts.json','utf8')) : englishSegments);
if(process.argv.includes('--hindi'))assert.ok(segments.every(s=>/[\u0900-\u097f]/u.test(s.text)&&!s.text.includes('???')),'Hindi fixture must retain Unicode');
await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Synthetic classroom experiment','text',JSON.stringify(segments),Date.now(),Date.now()).run();
const job=await enqueueSummary(owner,{id,language:fixture?.progress.language ?? (process.argv.includes('--hindi')?'Hindi':'English'),detail:fixture?.progress.detail ?? 'detailed'});
if(fixture){const progress={...fixture.progress,lockUntil:0,error:null,errorCode:undefined,evidenceIssues:undefined};await env.DB.prepare('INSERT INTO artifacts(note_id,kind,content,created_at) VALUES(?,?,?,?)').bind(id,'__summary_progress',JSON.stringify(progress),Date.now()).run();}
let finished;
for(let attempt=0;attempt<(fixture?60:6);attempt++){
 const started=Date.now(); await runNextJob(owner,job.id); console.log(JSON.stringify({elapsedMs:Date.now()-started}));finished=await findJob(owner,job.id);
 console.log(JSON.stringify({attempt:attempt+1,state:finished.state,code:finished.error_code,parts:finished.completed_parts}));
 const record=await env.DB.prepare("SELECT content FROM artifacts WHERE note_id=? AND kind='__summary_progress'").bind(id).first();if(record){const progress=JSON.parse(record.content);if(fixture)await writeFile('audit/production/real-note-test-progress.json',JSON.stringify({progress,segments}));if(finished.error_code)console.log(JSON.stringify({evidenceIssues:progress.evidenceIssues,reviewIssues:progress.reviewIssues}));}
 if(['completed','failed'].includes(finished.state)||(process.argv.includes('--first-part')&&finished.completed_parts>=1)||(process.argv.includes('--one-more')&&finished.completed_parts>(fixture?.progress.parts.length??0)))break;
 if(finished.error_code && !['QUALITY_REVIEW','QUALITY_EVIDENCE','PROVIDER_LIMIT','PROVIDER_COOLDOWN'].includes(finished.error_code))break;
 if(fixture){
  const wait=Math.max(15000,finished.next_at-Date.now());
  if(wait>300000)break; // Do not bypass a long provider quota reset.
  console.log(JSON.stringify({cooldownMs:wait}));
  await new Promise(resolve=>setTimeout(resolve,wait));
 }
 await env.DB.prepare('UPDATE ai_jobs SET next_at=0 WHERE id=?').bind(job.id).run();
}
const usage=await weeklyUsage(owner); const row=await env.DB.prepare('SELECT summary FROM notes WHERE id=?').bind(id).first(); if(process.argv.includes('--hindi')||fixture)await writeFile(fixture?'audit/production/vertex-real-note-result.json':'audit/production/vertex-hindi-result.json',row.summary||'null');
const report={checkedAt:new Date().toISOString(),state:finished.state,code:finished.error_code,parts:finished.completed_parts,total:finished.total_parts,weeklyUsed:usage.used,model:env.VERTEX_MODEL,scope:fixture?'User-authorized transcript; temporary in-memory database; real Vertex inference; at most 60 queue steps':'Synthetic source only; in-memory database; real Vertex inference; at most six queue steps'};
await writeFile(fixture?'audit/production/vertex-real-note-workflow.json':process.argv.includes('--hindi')?'audit/production/vertex-hindi-workflow.json':'audit/production/vertex-workflow.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(process.argv.includes('--one-more'))assert.ok(finished.completed_parts>(fixture?.progress.parts.length??0));else if(process.argv.includes('--first-part'))assert.ok(finished.completed_parts>=1);else assert.equal(finished.state,'completed');assert.equal(usage.used,1);
