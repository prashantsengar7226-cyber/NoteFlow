// Explicit opt-in. Recheck a private local draft with operator Gemini credentials.
// Application state uses in-memory SQLite; never reads a production database/key.
import nextEnv from '@next/env';
import {readFile,writeFile} from 'node:fs/promises';
import {env} from '../.test-runtime/harness.mjs';
import {aiContext} from '../.test-runtime/ai-context.mjs';
import {checkSummaryPart,SummaryQualityError,SummaryEvidenceError} from '../.test-runtime/summary-quality.mjs';
import {generateSummaryPart} from '../.test-runtime/server.mjs';
import {summarySourceChunks,summaryBoundaryContext} from '../.test-runtime/study.mjs';

if(!process.argv.includes('--live-repair'))throw new Error('Explicit opt-in required');
nextEnv.loadEnvConfig(process.cwd());
const synthetic=process.argv.includes('--synthetic');
const sample=synthetic?{
 model:'gemini-3.5-flash-lite',language:'Hindi',detail:'balanced',chunkVersion:3,
 source:[
  {id:0,start:0,text:'यह एक काल्पनिक कक्षा का अभ्यास है। प्रयोग में तीन पौधे लिए गए। पहले पौधे को रोज पानी दिया गया, दूसरे को हर दूसरे दिन, तीसरे को पानी नहीं दिया गया।'},
  {id:1,start:20,text:'सभी पौधों को एक जैसी मिट्टी, धूप और तापमान मिला। दस दिन बाद पहले पौधे की ऊँचाई दो सेंटीमीटर बढ़ी, दूसरे की एक सेंटीमीटर बढ़ी और तीसरा सूख गया।'},
  {id:2,start:40,text:'यह केवल तीन पौधों का छोटा प्रयोग है। इससे सभी प्रजातियों के लिए निष्कर्ष नहीं निकाला जा सकता। अधिक पानी देना हमेशा बेहतर है, ऐसा इस प्रयोग ने सिद्ध नहीं किया।'},
  {id:3,start:60,text:'अगला प्रयोग बीस पौधों पर होगा। यह भविष्य की योजना है, उसके परिणाम अभी उपलब्ध नहीं हैं।'},
 ],
 draft:{title:'पानी का प्रयोग',overview:'प्रयोग ने सिद्ध किया कि सभी पौधों को अधिक पानी देने से बेहतर वृद्धि होती है।',keyPoints:[{text:'बीस पौधों पर प्रयोग पूरा हुआ और सभी की ऊँचाई दो सेंटीमीटर बढ़ी।',segmentIds:[0,1,3]}],chapters:[]},
}:JSON.parse(await readFile('audit/production/repair-sample.json','utf8'));
const model=sample.model;
if(!model?.startsWith('gemini-')||!process.env.GEMINI_API_KEY)throw new Error('Gemini sample and operator key required');
const chunks=summarySourceChunks(sample.source,sample.detail,sample.chunkVersion);
env.AI_PROVIDER='gemini';env.MONETIZATION_MODE='free_launch';
const report={checkedAt:new Date().toISOString(),model,scope:synthetic?'Synthetic Hindi example only; no user content. Operator key and isolated storage.':'Reported first draft only; operator key, isolated storage. Not full-video verification.',steps:[],requests:[],result:'unverified'};
const reportPath=synthetic?'audit/production/repair-synthetic.json':'audit/production/repair-provider.json';
const originalFetch=globalThis.fetch;let phase='review',reviewIssues=sample.reviewIssues,evidenceIssues,draft=sample.draft;
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url??String(input));
 if(url.hostname!=='generativelanguage.googleapis.com'||report.requests.length>=6)throw new Error('Audit request bounds exceeded');
 const entry={phase,status:null,elapsedMs:null};report.requests.push(entry);const started=Date.now();
 try {
  const response=await originalFetch(input,init);entry.status=response.status;
  if(synthetic&&response.ok){
   const body=await response.clone().json();
   try{entry.output=JSON.parse(body.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join(''));}catch{}
  }
  return response;
 }
 finally {entry.elapsedMs=Date.now()-started;}
};
try {
 await aiContext.run({owner:'isolated-live-repair',candidate:{provider:'gemini',model,key:process.env.GEMINI_API_KEY}},async()=>{
  for(let step=0;step<6;step++){
   phase=draft?'review':'repair-generation';const started=Date.now();
   try{
    if(draft){
     const checked=await checkSummaryPart(draft,chunks[0],summaryBoundaryContext(chunks,0),sample.detail,evidenceIssues);
     report.steps.push({phase,result:'accepted',elapsedMs:Date.now()-started});
     report.result=synthetic&&!reviewIssues?'failed negative control':'first part accepted with source evidence';report.finalDraft=checked;break;
    }
    draft=await generateSummaryPart(chunks[0],sample.language,sample.detail,0,chunks.length,{source:sample.source,boundary:summaryBoundaryContext(chunks,0),reviewIssues});
    report.steps.push({phase,result:'generated',elapsedMs:Date.now()-started});
   }catch(error){
    report.steps.push({phase,code:error.code??'LOCAL_ERROR',elapsedMs:Date.now()-started,...(error instanceof SummaryQualityError?{issues:error.issues}:{})});
    if(error instanceof SummaryQualityError){reviewIssues=error.issues;draft=undefined;evidenceIssues=undefined;}
    else if(error instanceof SummaryEvidenceError)evidenceIssues=error.issues;
    else if(error.code!=='QUALITY_EVIDENCE')break;
   }
   await writeFile(reportPath,JSON.stringify(report,null,2));
  }
 });
 if(report.result!=='first part accepted with source evidence')process.exitCode=1;
} finally {
 globalThis.fetch=originalFetch;
 await writeFile(reportPath,JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,steps:report.steps.map(({issues,...s})=>({...s,...(issues?{issueCount:issues.length}: {})})),requests:report.requests.map(({output,...r})=>r),finalDraft:undefined}));
}
