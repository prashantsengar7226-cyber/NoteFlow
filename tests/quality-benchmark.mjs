// Opt-in: node tests/run.mjs --quality-benchmark. Uses synthetic text and live AI;
// data persistence/authentication remain entirely inside the local test harness.
import nextEnv from '@next/env';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {env,context} from '../.test-runtime/harness.mjs';
import * as notes from '../.test-runtime/notes.mjs';
import * as actions from '../.test-runtime/actions.mjs';
nextEnv.loadEnvConfig(process.cwd());
for(const key of ['AI_PROVIDER','AI_PROVIDER_ORDER','GEMINI_API_KEY','GEMINI_MODEL','GEMINI_FALLBACK_MODEL','GROQ_API_KEY','GROQ_MODEL','OPENROUTER_API_KEY','OPENROUTER_MODEL'])if(process.env[key])env[key]=process.env[key];
env.MONETIZATION_MODE='free_launch';env.BILLING_ENABLED='false';
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  if(!['generativelanguage.googleapis.com','api.groq.com','openrouter.ai'].includes(new URL(typeof input==='string'?input:input.url??String(input)).hostname))throw new Error('External host blocked in quality benchmark');
  const response=await originalFetch(input,init);
  if(response.status===400) {
    const data=await response.clone().json().catch(()=>null);
    console.log(JSON.stringify({event:'benchmark_provider_error',code:data?.error?.code,type:data?.error?.type}));
  }
  return response;
};
const facts=Array.from({length:24},(_,index)=>({name:'Station '+String.fromCharCode(65+index),value:String(1201+index*137)}));
const source=facts.map(({name,value},index)=>`${name} measured ${value} millilitres during its controlled observation. This is a fictional classroom experiment, not a real research finding. The class recorded the raw observation in its notebook and compared the same measure across all stations. The comparison uses matching units and consistent measurement periods. Students must keep each station's own value separate rather than combining the measurements into an average. ${index===23?'Final exception: Station X was excluded from the pooled analysis because its container leaked; retain its raw measurement for the audit.':''}`).join('\n\n');
const request=(module,method,payload,query='')=>context.run('quality-benchmark',()=>module[method](new Request('https://test.example/api/test'+query,{method,headers:{origin:'https://test.example','content-type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})})));
const report={checkedAt:new Date().toISOString(),passed:false,scope:'Synthetic English fact-retention proxy, live providers, temporary local data. Does not establish completeness or factual accuracy on real videos.',steps:[]};
const started=Date.now();
try {
  const created=await request(notes,'POST',{kind:'text',title:'Synthetic station observations',text:source});
  assert.equal(created.status,201);const id=(await created.json()).note.id;
  let result,runId,completedParts=0;
  for(let i=0;i<5;i++) {
    const start=Date.now();const response=await request(actions,'POST',{id,action:'summary',language:'English',detail:'detailed',incremental:true,runId,completedParts});
    const data=await response.json();
    report.steps.push({status:response.status,code:data.code,elapsedMs:Date.now()-start,completedParts:data.completedParts,totalParts:data.totalParts});
    if(!response.ok)throw new Error(data.code);
    completedParts=data.completedParts;runId=data.runId;
    if(data.result){result=data.result;break;}
  }
  assert.ok(result);
  const text=JSON.stringify(result).replaceAll(',','');
  report.retainedFacts=facts.filter(f=>text.includes(f.value)).length;
  report.expectedFacts=facts.length;
  report.finalException=/leak/i.test(text)&&/exclud/i.test(text);
  report.models=result.models;report.elapsedMs=Date.now()-started;
  const reopened=await request(notes,'GET',null,'?id='+id);const saved=await reopened.json();
  assert.deepEqual(saved.note.summary,result);assert.equal(saved.summaryProgress,null);
  assert.equal(report.retainedFacts,24);assert.equal(report.finalException,true);
  report.passed=true;
} catch(error) {report.failure=report.steps.at(-1)?.code??'FACT_RETENTION_CHECK_FAILED';process.exitCode=1;}
finally {globalThis.fetch=originalFetch;await mkdir('audit',{recursive:true});await writeFile('audit/quality-benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
