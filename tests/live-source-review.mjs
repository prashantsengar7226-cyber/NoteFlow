// Opt-in, bounded real-provider retest of one public transcript sample.
// All application state stays in the test harness's in-memory SQLite database.
import nextEnv from '@next/env';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {env,context} from '../.test-runtime/harness.mjs';
import * as connection from '../.test-runtime/ai-connection.mjs';
import {withOwnerAI} from '../.test-runtime/personal-ai.mjs';
import {checkSummaryPart,SummaryQualityError} from '../.test-runtime/summary-quality.mjs';
import {generateSummaryPart} from '../.test-runtime/server.mjs';
import {summarySourceChunks,summaryBoundaryContext} from '../.test-runtime/study.mjs';

if(!process.argv.includes('--live-source-review'))throw new Error('Explicit live-source-review opt-in required.');
nextEnv.loadEnvConfig(process.cwd());
for(const k of ['AI_PROVIDER','GEMINI_API_KEY','GEMINI_MODEL'])if(process.env[k])env[k]=process.env[k];
env.MONETIZATION_MODE='free_launch';env.BILLING_ENABLED='false';env.BYOK_ENCRYPTION_KEY=randomBytes(32).toString('base64');
const report={checkedAt:new Date().toISOString(),scope:'One cached public Hindi transcript part, not a full-video or production test. Real Gemini calls with configured site credentials through a temporary personal connection; no live database access.',steps:[],requests:[],reviews:[],finalDraft:null,result:'unverified'};
await mkdir('audit',{recursive:true});
const save=()=>writeFile('audit/live-source-review.json',JSON.stringify(report,null,2));
const originalFetch=globalThis.fetch;
let phase='connection';
globalThis.fetch=async(input,init)=>{
  const host=new URL(typeof input==='string'?input:input.url??String(input)).hostname;
  if(host!=='generativelanguage.googleapis.com'||report.requests.length>=12)throw new Error('Live sample request outside audit bounds.');
  const started=Date.now();
  const response=await originalFetch(input,init);
  report.requests.push({phase,status:response.status,elapsedMs:Date.now()-started,retryAfter:response.headers.get('retry-after')});
  if(response.ok&&phase==='review'){
    const data=await response.clone().json();
    const text=data.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('');
    try{report.reviews.push(JSON.parse(text));}catch{}
  }
  return response;
};
try{
  const baseline=JSON.parse(await readFile('audit/live-queue-verification.json','utf8'));
  if(!baseline.videoSample?.draft)throw new Error('Run the live queue sample first.');
  const transcript=JSON.parse(await readFile('audit/real-video/slW0ZIXlXrY/provider-transcript.json','utf8'));
  const chunks=summarySourceChunks(transcript,'detailed');const index=2;
  const owner='live-source-review';
  const connected=await context.run(owner,()=>connection.POST(new Request('https://test.example/api/ai-connection',{method:'POST',headers:{origin:'https://test.example','content-type':'application/json'},body:JSON.stringify({provider:'gemini',model:env.GEMINI_MODEL||'gemini-3.6-flash',key:env.GEMINI_API_KEY,consent:true})})));
  if(!connected.ok){report.steps.push({check:'Connection',status:connected.status,code:(await connected.json()).code});process.exitCode=1;}
  else{
    let draft=baseline.videoSample.draft,reviewIssues,repaired=false;
    for(let step=0;step<6;step++){
      await new Promise(resolve=>setTimeout(resolve,15000));
      phase=draft?'review':'repair-generation';
      try{
        if(!draft){
          draft=await withOwnerAI(owner,()=>generateSummaryPart(chunks[index],'Source language','detailed',index,chunks.length,{source:transcript,boundary:summaryBoundaryContext(chunks,index),reviewIssues}));
          repaired=true;
          report.steps.push({check:'Repair generation',result:'generated'});
        }else{
          await withOwnerAI(owner,()=>checkSummaryPart(draft,chunks[index],summaryBoundaryContext(chunks,index),'detailed'));
          report.steps.push({check:'Source review',result:'accepted',initialCandidate:!repaired});
          // The baseline silently chooses gold despite a conflicting silver-list heading.
          // Accepting it is a failed negative control, even if its quotes are valid.
          report.result=!repaired?'failed negative control':'passed automated sample review';
          report.finalDraft=draft;
          if(!repaired)process.exitCode=1;
          break;
        }
      }catch(error){
        report.steps.push({check:phase,result:'rejected',code:error.code??'UNKNOWN',...(error instanceof SummaryQualityError?{issues:error.issues}:{})});
        if(error instanceof SummaryQualityError){reviewIssues=error.issues;draft=undefined;}
        else if(!['QUALITY_EVIDENCE','INVALID_AI_OUTPUT','INVALID_CITATION'].includes(error.code))break;
      }
      await save();
    }
    if(report.result==='unverified')process.exitCode=1;
  }
}catch(error){report.error={code:error.code??'LOCAL_TEST_ERROR'};process.exitCode=1;}
finally{globalThis.fetch=originalFetch;await save();console.log(JSON.stringify({event:'live_source_review_finished',result:report.result,steps:report.steps}));}
