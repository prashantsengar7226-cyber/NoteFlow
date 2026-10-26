// Explicit live opt-in. Only synthetic text; application state is in-memory SQLite.
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import {env} from '../.test-runtime/harness.mjs';
import {enqueueSummary,runNextJob,findJob} from '../.test-runtime/ai-jobs.mjs';
import {weeklyUsage} from '../.test-runtime/ai-policy.mjs';
const local=parseEnv(await readFile('.env.local','utf8'));
Object.assign(env,{AI_FEATURE_ROUTING:'true',VERTEX_ENABLED:'true',VERTEX_PROJECT_ID:local.VERTEX_PROJECT_ID,VERTEX_SERVICE_ACCOUNT_JSON:local.VERTEX_SERVICE_ACCOUNT_JSON,VERTEX_LOCATION:'global',VERTEX_MODEL:'gemini-3.8-flash',VERTEX_CREDIT_EXPIRES_AT:'2027-01-18T00:00:00Z',VERTEX_DAILY_REQUEST_CAP:'8',VERTEX_TOTAL_REQUEST_CAP:'8'});
const owner='vertex-live-synthetic',id=crypto.randomUUID();
const segments=[{id:0,start:0,text:'A classroom experiment compared two groups of ten students. Group A practiced recall on Monday and Thursday. Group B reread the lesson only on Thursday.'},{id:1,start:30,text:'On Friday, Group A averaged eight correct answers out of ten. Group B averaged six. This small experiment does not prove that spaced practice works for everyone.'}];
await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Synthetic classroom experiment','text',JSON.stringify(segments),Date.now(),Date.now()).run();
const job=await enqueueSummary(owner,{id,language:'English',detail:'concise'});
let finished;
for(let attempt=0;attempt<6;attempt++){
 await runNextJob(owner,job.id);finished=await findJob(owner,job.id);
 console.log(JSON.stringify({attempt:attempt+1,state:finished.state,code:finished.error_code,parts:finished.completed_parts}));
 if(['completed','failed'].includes(finished.state))break;
 if(finished.error_code && !['QUALITY_REVIEW','QUALITY_EVIDENCE'].includes(finished.error_code))break;
 await env.DB.prepare('UPDATE ai_jobs SET next_at=0 WHERE id=?').bind(job.id).run();
}
const usage=await weeklyUsage(owner);
const report={checkedAt:new Date().toISOString(),state:finished.state,code:finished.error_code,parts:finished.completed_parts,total:finished.total_parts,weeklyUsed:usage.used,scope:'Synthetic source only; in-memory database; real Vertex inference; at most six queue steps'};
await writeFile('audit/production/vertex-workflow.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
assert.equal(finished.state,'completed');assert.equal(usage.used,1);
