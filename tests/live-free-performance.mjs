// Opt-in: synthetic transcript, in-memory test database, at most six free requests.
import nextEnv from '@next/env';
import {writeFile} from 'node:fs/promises';
import {env} from '../.test-runtime/harness.mjs';
import {enqueueSummary,drainJobs,findJob} from '../.test-runtime/ai-jobs.mjs';
import {withOwnerAI} from '../.test-runtime/personal-ai.mjs';
import {withAIFeature} from '../.test-runtime/ai-policy.mjs';
import {generateArtifact} from '../.test-runtime/server.mjs';
nextEnv.loadEnvConfig(process.cwd());
env.AI_FEATURE_ROUTING='true';env.AI_PROVIDER='gemini';
for(const name of ['GEMINI_FREE_API_KEY','GEMINI_FREE_TIER_CONFIRMED','GEMINI_FREE_MODEL'])env[name]=process.env[name];
if(!env.GEMINI_FREE_API_KEY||env.GEMINI_FREE_TIER_CONFIRMED!=='true')throw Error('A confirmed Gemini Free-tier key is required');
const fetchOriginal=globalThis.fetch;let requests=0;
globalThis.fetch=async(url,init)=>{if(new URL(url).hostname!=='generativelanguage.googleapis.com'||requests>=6)throw Error('Live request budget exceeded');requests++;const response=await fetchOriginal(url,init);const value=await response.clone().json().catch(()=>null);if(!response.ok)report.providerError={status:response.status,code:value?.error?.status};else{report.outputs??=[];report.outputs.push({model:value?.modelVersion,finish:value?.candidates?.[0]?.finishReason,content:value?.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('')});}return response;};
const source=[{id:0,start:0,text:'In 2024 the school bought 120 books. In 2025 it bought 30 more, for a total of 150.'},{id:1,start:15,text:'Buying 50 more books next year is proposed but has not been approved.'},{id:2,start:30,text:'Students can borrow a book for 14 days. A late return costs 2 rupees per day.'}];
const owner='synthetic-free-performance',id=crypto.randomUUID(),report={requests:0,checks:[]};
try{
 await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Synthetic books','text',JSON.stringify(source),Date.now(),Date.now()).run();
 let state; if(!process.argv.includes('--quiz-only')){
 const job=await enqueueSummary(owner,{id,language:'Hindi',detail:'balanced'});const start=Date.now();
 await drainJobs(owner,job.id);state=await findJob(owner,job.id);
 // Respect the real queued retry time, within the same six-request test budget.
 if(state.state==='retry'&&requests<=3&&state.next_at-Date.now()<=120000){
  const delay=Math.max(0,state.next_at-Date.now());console.log(JSON.stringify({queuedRetryWaitMs:delay,code:state.error_code}));
  await new Promise(resolve=>setTimeout(resolve,delay+100));await drainJobs(owner,job.id);state=await findJob(owner,job.id);
 }
 report.checks.push({feature:'summary with source review',state:state.state,code:state.error_code,elapsedMs:Date.now()-start,completedParts:state.completed_parts});
 }
 if(state?.state==='completed'||process.argv.includes('--quiz-only')){
  const began=Date.now();const quiz=await withOwnerAI(owner,()=>withAIFeature('quiz',()=>generateArtifact('quiz',source,'English',undefined,{count:5,difficulty:'easy',focus:'balanced',existing:[]})));
  report.checks.push({feature:'quiz',items:quiz.questions?.length,elapsedMs:Date.now()-began});
 }
}catch(e){report.error=e.code||'FAILED';}
finally{report.requests=requests;globalThis.fetch=fetchOriginal;await writeFile(process.argv.includes('--quiz-only')?'audit/live-gemini-quiz.json':'audit/live-gemini-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}

if(process.argv.includes('--quiz-only')?!report.checks[0]?.items:report.checks[0]?.state!=='completed'||!report.checks[1]?.items)process.exitCode=1;
