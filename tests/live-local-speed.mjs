// Live admin smoke test: synthetic source and memory-only database; four inference requests maximum.
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {env} from '../.test-runtime/harness.mjs';
import {enqueueSummary,drainJobs,findJob} from '../.test-runtime/ai-jobs.mjs';
const local=parseEnv(await readFile('.env.local','utf8'));
for(const key of ['VERTEX_ENABLED','VERTEX_PROJECT_ID','VERTEX_SERVICE_ACCOUNT_JSON','VERTEX_LOCATION','VERTEX_MODEL','VERTEX_CREDIT_EXPIRES_AT'])env[key]=local[key];
env.AI_FEATURE_ROUTING='true';
const owner='local-speed-admin',id=crypto.randomUUID();
await env.DB.prepare("INSERT INTO user_access(owner,role,suspended,revision,updated_by,updated_at) VALUES(?,'admin',0,?,'local-test',?)").bind(owner,crypto.randomUUID(),Date.now()).run();
const source=[{id:0,start:0,text:'In 2024 the school bought 120 books. In 2025 it bought 30 more, for a total of 150.'},{id:1,start:15,text:'Buying 50 more books next year is proposed but has not been approved.'},{id:2,start:30,text:'Students can borrow a book for 14 days. A late return costs 2 rupees per day.'}];
await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Synthetic books','text',JSON.stringify(source),Date.now(),Date.now()).run();
const original=globalThis.fetch,requests=[];
globalThis.fetch=async(url,init)=>{
 const host=new URL(url).hostname;
 if(host==='oauth2.googleapis.com')return original(url,init);
 if(!host.endsWith('aiplatform.googleapis.com')||requests.length>=4)throw Error('Live request boundary');
 const entry={elapsedMs:0,status:0};requests.push(entry);const began=Date.now();
 try {const response=await original(url,init);entry.status=response.status;return response;}finally{entry.elapsedMs=Date.now()-began;}
};
const report={checkedAt:new Date().toISOString(),scope:'Live Vertex, synthetic transcript, temporary memory-only database',model:env.VERTEX_MODEL,requests};
const started=Date.now();
try{
 const job=await enqueueSummary(owner,{id,language:'English',detail:'balanced'});
 report.steps=await drainJobs(owner,job.id);
 const result=await findJob(owner,job.id);
 Object.assign(report,{state:result.state,code:result.error_code,completedParts:result.completed_parts,totalParts:result.total_parts});
 const row=await env.DB.prepare('SELECT summary FROM notes WHERE id=?').bind(id).first();report.summary=row.summary?JSON.parse(row.summary):null;
}catch(e){report.error=e.code||'TEST_FAILED';}
finally{report.elapsedMs=Date.now()-started;globalThis.fetch=original;await writeFile('audit/local-live-vertex.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,summary:undefined}));}
if(report.state!=='completed')process.exitCode=1;
