// Explicit opt-in live regression: node tests/run.mjs --live-summary
// Synthetic source + in-memory migrated SQLite. Never uses real notes/accounts.
import nextEnv from '@next/env';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {env,context} from '../.test-runtime/harness.mjs';
import * as notes from '../.test-runtime/notes.mjs';
import * as actions from '../.test-runtime/actions.mjs';
nextEnv.loadEnvConfig(process.cwd());
for(const key of ['AI_PROVIDER','AI_PROVIDER_ORDER','GEMINI_API_KEY','GEMINI_MODEL','GEMINI_FALLBACK_MODEL','GROQ_API_KEY','GROQ_MODEL','OPENROUTER_API_KEY','OPENROUTER_MODEL']) if(process.env[key])env[key]=process.env[key];
env.MONETIZATION_MODE='free_launch';env.BILLING_ENABLED='false';
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{
  const host=new URL(typeof input==='string'?input:input.url??String(input)).hostname;
  if(!['generativelanguage.googleapis.com','api.groq.com','openrouter.ai'].includes(host)) throw new Error('Live QA allows only configured AI providers');
  return originalFetch(input,init);
};
const request=(module,method,payload,query='')=>context.run('live-synthetic-summary',()=>module[method](new Request('https://test.example/api/test'+query,{method,headers:{origin:'https://test.example','content-type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})})));
const source=Array.from({length:220},(_,i)=>`Lesson ${i+1}: Plants use sunlight and water to grow. Spaced practice improves recall. A study schedule divides learning into short sessions. Reviewing a lesson after a break strengthens memory.\n`).join('');
const report={checkedAt:new Date().toISOString(),passed:false,scope:'Four-or-more part Hindi detailed summary of synthetic educational text; live AI providers; only an in-memory test database.',steps:[]};
try {
  const created=await request(notes,'POST',{kind:'text',title:'Synthetic multi-part Hindi QA',text:source});
  assert.equal(created.status,201);const id=(await created.json()).note.id;
  let runId,completedParts=0,result;
  for(let i=0;i<8;i++) {
    const response=await request(actions,'POST',{id,action:'summary',incremental:true,language:'Hindi',detail:'detailed',runId,completedParts});
    const data=await response.json();
    report.steps.push({status:response.status,code:data.code,completedParts:data.completedParts,totalParts:data.totalParts});
    if(!response.ok) throw new Error(data.code??'SUMMARY_FAILED');
    assert.equal(data.completedParts,completedParts+1);
    runId=data.runId;completedParts=data.completedParts;
    if(data.result) {result=data.result;break;}
  }
  assert.ok(result);assert.ok(completedParts>=4);assert.equal(result.language,'Hindi');
  assert.match(result.overview,/[\u0900-\u097f]/);
  const reopened=await request(notes,'GET',null,'?id='+id);const saved=await reopened.json();
  assert.equal(saved.summaryProgress,null);assert.deepEqual(saved.note.summary,result);
  assert.ok(saved.note.transcript.map(segment=>segment.text).join('').includes('Lesson 220'));
  report.passed=true;report.completedParts=completedParts;report.models=result.models;
} catch(error) {report.failure=report.steps.at(-1)?.code??'LIVE_REGRESSION_FAILED';process.exitCode=1;}
finally {
  globalThis.fetch=originalFetch;await mkdir('audit',{recursive:true});
  await writeFile('audit/live-summary.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
