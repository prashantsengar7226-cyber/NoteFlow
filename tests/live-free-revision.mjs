// Explicit live opt-in. Synthetic Hindi source; memory-only accounts/database.
import nextEnv from '@next/env';
import {readFile,writeFile} from 'node:fs/promises';
import {env} from '../.test-runtime/harness.mjs';
import {enqueueSummary,runNextJob,findJob} from '../.test-runtime/ai-jobs.mjs';
nextEnv.loadEnvConfig(process.cwd());
const model=process.argv.find(a=>a.startsWith('--model='))?.slice(8)||'openrouter/free';
if(model!=='openrouter/free'&&!model.endsWith(':free'))throw new Error('Free model required');
Object.assign(env,{AI_FEATURE_ROUTING:'true',AI_ADMIN_USER_IDS:'',AI_PROVIDER:'router',AI_PROVIDER_ORDER:'openrouter',OPENROUTER_API_KEY:process.env.OPENROUTER_API_KEY,OPENROUTER_MODEL:model,VERTEX_ENABLED:'false',MONETIZATION_MODE:'free_launch'});
const source=JSON.parse(await readFile('tests/fixtures/hindi-facts.json','utf8'));
const original=globalThis.fetch,requests=[];
globalThis.fetch=async(url,init)=>{
  if(new URL(url).hostname!=='openrouter.ai'||requests.length>=8)throw new Error('Live free test request boundary');
  const body=JSON.parse(init.body);
  if(body.model!==model||body.provider?.max_price?.prompt!==0||body.provider?.max_price?.completion!==0)throw new Error('Expected zero-price routing');
  const started=Date.now();let status=0;
  try {const response=await original(url,init);status=response.status;return response;}
  finally {requests.push({status,elapsedMs:Date.now()-started});}
};
const owner='synthetic-free-revision',id=crypto.randomUUID();
await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Synthetic Hindi revision','text',JSON.stringify(source),Date.now(),Date.now()).run();
let job=await enqueueSummary(owner,{id,language:'Hindi',detail:'detailed'});
for(let step=0;step<8;step++){
  await runNextJob(owner,job.id);job=await findJob(owner,job.id);
  if(['completed','failed','cancelled'].includes(job.state)||(job.error_code&&!['QUALITY_REVIEW','QUALITY_EVIDENCE'].includes(job.error_code)))break;
  await new Promise(r=>setTimeout(r,Math.max(0,job.next_at-Date.now())));
}
const row=await env.DB.prepare('SELECT summary FROM notes WHERE id=?').bind(id).first();
const summary=row.summary?JSON.parse(row.summary):null;
const report={checkedAt:new Date().toISOString(),model,scope:'Synthetic Hindi source; free OpenRouter only; temporary local storage; no Vertex calls',state:job.state,code:job.error_code,parts:job.completed_parts,total:job.total_parts,requests,summary};
await writeFile('audit/free-revision-live.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,summary:summary?{engine:summary.engine,sourceChecks:summary.sourceChecks,models:summary.models}:null}));
globalThis.fetch=original;
if(job.state!=='completed')process.exitCode=1;
