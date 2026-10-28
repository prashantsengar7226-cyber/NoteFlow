// Explicit live benchmark: authorized saved transcript, memory-only database, <=52 inference requests and ten-minute scheduling window.
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {env} from '../.test-runtime/harness.mjs';
import {summarySourceChunks} from '../.test-runtime/study.mjs';
import {enqueueSummary,drainJobs,findJob} from '../.test-runtime/ai-jobs.mjs';
const local=parseEnv(await readFile('.env.local','utf8'));
for(const key of ['VERTEX_ENABLED','VERTEX_PROJECT_ID','VERTEX_SERVICE_ACCOUNT_JSON','VERTEX_LOCATION','VERTEX_MODEL','VERTEX_CREDIT_EXPIRES_AT'])env[key]=local[key];
env.AI_FEATURE_ROUTING='true';
const batchVersion=process.argv.includes('--large')?4:3; env.SUMMARY_LARGE_BATCHES=batchVersion===4?'true':'false';
const owner='local-speed-admin',id=crypto.randomUUID();
await env.DB.prepare("INSERT INTO user_access(owner,role,suspended,revision,updated_by,updated_at) VALUES(?,'admin',0,?,'local-test',?)").bind(owner,crypto.randomUUID(),Date.now()).run();
const allSource=JSON.parse(await readFile('audit/production/current-note-review-fixture.json','utf8')).segments;
const source=process.argv.includes('--problem-part')?summarySourceChunks(allSource,'balanced',3)[4]:allSource;
await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Authorized transcript benchmark','text',JSON.stringify(source),Date.now(),Date.now()).run();
const original=globalThis.fetch,requests=[];
globalThis.fetch=async(url,init)=>{
 const host=new URL(url).hostname;
 if(host==='oauth2.googleapis.com')return original(url,init);
 if(!host.endsWith('aiplatform.googleapis.com')||requests.length>=52)throw Error('Live request boundary');
 const system=JSON.parse(init.body).systemInstruction?.parts?.[0]?.text||''; const phase=system.includes('Repair rejected claims only')?'repair':system.includes('skeptical source reviewer')?'review':'draft';
 const entry={phase,elapsedMs:0,status:0};requests.push(entry);const began=Date.now();
 try {const response=await original(url,init);entry.status=response.status;return response;}finally{entry.elapsedMs=Date.now()-began;}
};
const report={checkedAt:new Date().toISOString(),scope:'Live Vertex, previously authorized Hindi transcript, temporary memory-only database',batchVersion,model:env.VERTEX_MODEL,requests};
const started=Date.now();
try{
 const job=await enqueueSummary(owner,{id,language:'Hindi',detail:'balanced'});
  report.steps=0;
 while(Date.now()-started<600000 && requests.length<52){
  report.steps+=await drainJobs(owner,job.id);
  const state=await findJob(owner,job.id);
  console.log(JSON.stringify({batchVersion,state:state.state,parts:state.completed_parts,total:state.total_parts,elapsedMs:Date.now()-started,requests:requests.length,code:state.error_code}));
  if(['completed','failed','cancelled'].includes(state.state))break;
  const wait=Math.max(0,state.next_at-Date.now());
  if(wait>60000)break;
  if(wait)await new Promise(r=>setTimeout(r,wait+50));
 }
 const result=await findJob(owner,job.id);
 Object.assign(report,{state:result.state,code:result.error_code,completedParts:result.completed_parts,totalParts:result.total_parts});
 const row=await env.DB.prepare('SELECT summary FROM notes WHERE id=?').bind(id).first();report.summary=row.summary?JSON.parse(row.summary):null; const checkpoint=await env.DB.prepare('SELECT content FROM artifacts WHERE note_id=? AND kind=?').bind(id,'__summary_progress').first(); if(checkpoint){const p=JSON.parse(checkpoint.content);report.reviewIssues=p.reviewIssues;report.evidenceIssues=p.evidenceIssues;}
}catch(e){report.error=e.code||'TEST_FAILED';}
finally{report.elapsedMs=Date.now()-started;globalThis.fetch=original;await writeFile('audit/'+(process.argv.includes('--problem-part')?'problem-part-':'full-video-')+'v'+batchVersion+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,summary:undefined}));}
if(report.state!=='completed')process.exitCode=1;
