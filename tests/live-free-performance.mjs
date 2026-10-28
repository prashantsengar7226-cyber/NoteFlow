// Opt-in: synthetic transcript, in-memory test database, at most six free requests.
import nextEnv from '@next/env';
import {writeFile} from 'node:fs/promises';
import {env} from '../.test-runtime/harness.mjs';
import {enqueueSummary,drainJobs,findJob} from '../.test-runtime/ai-jobs.mjs';
import {withOwnerAI} from '../.test-runtime/personal-ai.mjs';
import {withAIFeature} from '../.test-runtime/ai-policy.mjs';
import {generateArtifact} from '../.test-runtime/server.mjs';
nextEnv.loadEnvConfig(process.cwd());
env.AI_FEATURE_ROUTING='true';env.AI_PROVIDER='router';env.AI_PROVIDER_ORDER='openrouter';
env.OPENROUTER_API_KEY=process.env.OPENROUTER_API_KEY;env.OPENROUTER_MODEL='dots-studio/dots-3-note-preview:free';
const fetchOriginal=globalThis.fetch;let requests=0;
globalThis.fetch=async(url,init)=>{if(new URL(url).hostname!=='openrouter.ai'||++requests>6)throw Error('Live request budget exceeded');const response=await fetchOriginal(url,init);const value=await response.clone().json().catch(()=>null);if(!response.ok)report.providerError={status:response.status,message:value?.error?.message};else{report.outputs??=[];report.outputs.push({model:value?.model,finish:value?.choices?.[0]?.finish_reason,content:value?.choices?.[0]?.message?.content});}return response;};
const source=[{id:0,start:0,text:'In 2024 the school bought 120 books. In 2025 it bought 30 more, for a total of 150.'},{id:1,start:15,text:'Buying 50 more books next year is proposed but has not been approved.'},{id:2,start:30,text:'Students can borrow a book for 14 days. A late return costs 2 rupees per day.'}];
const owner='synthetic-free-performance',id=crypto.randomUUID(),report={requests:0,checks:[]};
try{
 await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Synthetic books','text',JSON.stringify(source),Date.now(),Date.now()).run();
 const job=await enqueueSummary(owner,{id,language:'Hindi',detail:'balanced'});const start=Date.now();
 await drainJobs(owner,job.id);const state=await findJob(owner,job.id);
 report.checks.push({feature:'summary with source review',state:state.state,code:state.error_code,elapsedMs:Date.now()-start,completedParts:state.completed_parts});
 if(state.state==='completed'){
  const began=Date.now();const quiz=await withOwnerAI(owner,()=>withAIFeature('quiz',()=>generateArtifact('quiz',source,'English',undefined,{count:5,difficulty:'easy',focus:'balanced',existing:[]})));
  report.checks.push({feature:'quiz',items:quiz.questions?.length,elapsedMs:Date.now()-began});
 }
}catch(e){report.error=e.code||'FAILED';}
finally{report.requests=requests;globalThis.fetch=fetchOriginal;await writeFile('audit/live-free-performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
