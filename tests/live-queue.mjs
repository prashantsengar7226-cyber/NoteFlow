// Opt-in live provider verification. Identity and all application storage remain local/in-memory.
import nextEnv from '@next/env';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {env,context} from '../.test-runtime/harness.mjs';
import * as connection from '../.test-runtime/ai-connection.mjs';
import {enqueueSummary,runNextJob,findJob} from '../.test-runtime/ai-jobs.mjs';
import {withOwnerAI} from '../.test-runtime/personal-ai.mjs';
import {checkSummaryPart} from '../.test-runtime/summary-quality.mjs';
import {generateSummaryPart,usage} from '../.test-runtime/server.mjs';
import {summarySourceChunks,summaryBoundaryContext} from '../.test-runtime/study.mjs';
if(!process.argv.includes('--live-queue'))throw new Error('Use tests/run.mjs --live-queue to opt in to real provider requests.');
const providerFilter=process.argv.find(arg=>arg.startsWith('--provider='))?.split('=')[1];
if(providerFilter&&!['gemini','groq','openrouter'].includes(providerFilter))throw new Error('Unsupported audit provider.');
const injectReviewTimeout=process.argv.includes('--inject-review-timeout');
const skipVideo=process.argv.includes('--skip-video');
const reportPath=`audit/live-queue-${providerFilter??'verification'}.json`;
nextEnv.loadEnvConfig(process.cwd());
for(const k of ['AI_PROVIDER','AI_PROVIDER_ORDER','GEMINI_API_KEY','GEMINI_MODEL','GEMINI_FALLBACK_MODEL','GROQ_API_KEY','GROQ_MODEL','OPENROUTER_API_KEY','OPENROUTER_MODEL'])if(process.env[k])env[k]=process.env[k];
env.MONETIZATION_MODE='free_launch';env.BILLING_ENABLED='false';env.BYOK_ENCRYPTION_KEY=randomBytes(32).toString('base64');
const report={checkedAt:new Date().toISOString(),scope:'Real provider calls using the locally configured site credentials through the personal-key code path. Synthetic identities and in-memory SQLite; no live app records/accounts or real user-supplied keys. Does not prove an independent user account has additional provider quota.',options:{provider:providerFilter??'first successful connection',injectReviewTimeout,skipVideo},connections:[],steps:[],requests:[],sourceReviews:[],videoSample:null};
await mkdir('audit',{recursive:true});
const save=()=>writeFile(reportPath,JSON.stringify(report,null,2));
const fetchOriginal=globalThis.fetch;
let phase='connection';
let timeoutInjected=false;
globalThis.fetch=async(input,init)=>{
  const host=new URL(typeof input==='string'?input:input.url??String(input)).hostname;
  if(!['generativelanguage.googleapis.com','api.groq.com','openrouter.ai'].includes(host))throw new Error('Live audit host blocked');
  if(report.requests.length>=24)throw new Error('Live audit request budget exhausted');
  if(injectReviewTimeout&&!timeoutInjected&&phase==='synthetic-queue'&&init?.body?.includes('skeptical source reviewer')){
    timeoutInjected=true;
    report.steps.push({check:'Recovery fault injection',result:'injected',detail:'One local review timeout before contacting the provider. Subsequent requests use the real provider; retry times are not bypassed.'});
    throw new DOMException('Injected local review timeout','TimeoutError');
  }
  const start=Date.now();
  const r=await fetchOriginal(input,init);
  report.requests.push({phase,host,status:r.status,elapsedMs:Date.now()-start,retryAfter:r.headers.get('retry-after'),rateLimits:Object.fromEntries([...r.headers].filter(([k])=>/^x-ratelimit-(limit|remaining|reset)-(requests|tokens)$/.test(k)))});
  if(r.ok&&init?.body?.includes('skeptical source reviewer')){
    const value=await r.clone().json();
    const text=value.choices?.[0]?.message?.content??value.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('');
    try{
      const request=JSON.parse(init.body);
      const content=request.contents?.[0]?.parts?.[0]?.text??request.messages?.findLast(m=>m.role==='user')?.content;
      const candidate=JSON.parse(content.slice(content.indexOf('\n')+1).split('\nCURRENT SOURCE:')[0]).candidate;
      report.sourceReviews.push({phase,candidate,review:JSON.parse(text)});
    }catch{}
  }
  return r;
};
const candidates=[['gemini','GEMINI_API_KEY','GEMINI_MODEL','gemini-3.6-flash'],['groq','GROQ_API_KEY','GROQ_MODEL','openai/gpt-oss-120b'],['openrouter','OPENROUTER_API_KEY','OPENROUTER_MODEL','openrouter/free']];
let selected;
try {
  for(const [provider,keyName,modelName,fallback] of candidates){
    if(providerFilter&&provider!==providerFilter)continue;
    if(!env[keyName])continue;
    const owner=`live-queue-${provider}`;const model=env[modelName]||fallback;
    const response=await context.run(owner,()=>connection.POST(new Request('https://test.example/api/ai-connection',{method:'POST',headers:{origin:'https://test.example','content-type':'application/json'},body:JSON.stringify({provider,model,key:env[keyName],consent:true})})));
    const value=await response.json();
    const result={provider,model,status:response.status,code:value.code,connected:response.ok};
    report.connections.push(result);console.log(JSON.stringify({event:'live_connection',...result}));await save();
    if(response.ok&&!selected)selected={owner,provider};
  }
  if(!selected){report.steps.push({check:'Live queue generation',result:'blocked',reason:'No configured provider passed the actual personal-key connection test'});await save();process.exitCode=1;}
  else {
    const source=[
      {id:0,start:0,text:'This fictional test lesson describes two different events. The River Games will take place in Cedar City in 2026. The Mountain Games will take place in Pine City in 2030.'},
      {id:1,start:15,text:'Kiran lifted 128 kilograms in the 55-kilogram weight category. The weight lifted and weight category are different numbers.'},
      {id:2,start:30,text:'I first said Nisha competes in long jump. Correction: Nisha competes in high jump, not long jump. Nisha won two gold medals. Other athletes are named, but their medal counts are not stated.'},
      {id:3,start:45,text:'The review method has three steps: read the entire source, preserve each number with its subject, and record explicit corrections. We cannot infer facts from slides that are not transcribed.'},
    ];
    const id=crypto.randomUUID();const {owner}=selected;
    await env.DB.prepare('INSERT INTO notes(id,owner,title,source,transcript,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,'Live queue evidence test','text',JSON.stringify(source),Date.now(),Date.now()).run();
    await env.DB.prepare('INSERT INTO limits(owner,bucket,count) VALUES(?,?,20)').bind(`service:v2:ai:${owner}`,Math.floor(Date.now()/86400000)).run();
    let job=await enqueueSummary(owner,{id,language:'English',detail:'detailed'});
    const deadline=Date.now()+480000;
    for(let steps=0;steps<8&&Date.now()<deadline;steps++){
      const wait=Math.max(0,job.next_at-Date.now());
      if(Date.now()+wait>deadline){report.steps.push({check:'Queue retry',result:'pending',reason:job.error_code,nextAt:job.next_at});break;}
      if(wait){console.log(JSON.stringify({event:'waiting_for_recorded_retry',waitSeconds:Math.ceil(wait/1000)}));let remaining=wait+100;while(remaining>0){const step=Math.min(30000,remaining);await new Promise(resolve=>setTimeout(resolve,step));remaining-=step;}}
      phase='synthetic-queue';await runNextJob(owner,job.id);job=await findJob(owner,job.id);
      const state={state:job.state,errorCode:job.error_code,completedParts:job.completed_parts,nextAt:job.next_at};
      console.log(JSON.stringify({event:'live_queue',...state}));report.steps.push({check:'Queue step',...state});await save();
      if(['completed','failed','cancelled'].includes(job.state))break;
    }
    const row=await env.DB.prepare('SELECT summary FROM notes WHERE id=?').bind(id).first();
    report.generatedSummary=row.summary?JSON.parse(row.summary):null;
    report.steps.push({check:'No NoteFlow daily AI cap with personal connection',result:job.state==='completed'&&(await usage(owner)).ai===20?'pass':'unverified',sharedCounterAfter:(await usage(owner)).ai});
    if(injectReviewTimeout)report.steps.push({check:'Automatic recovery after an injected review timeout',result:timeoutInjected&&job.state==='completed'?'pass':'unverified',timeoutInjected,finalState:job.state});
    {
      await new Promise(resolve=>setTimeout(resolve,15000));
      phase='adversarial-review';
      const wrong={title:'Fictional games',overview:'Nisha won 99 medals in long jump.',keyPoints:[{text:'The River Games take place in Pine City in 2030.',segmentIds:[0]}],chapters:[]};
      try{await withOwnerAI(owner,()=>checkSummaryPart(wrong,source,'','detailed'));report.steps.push({check:'Reject invented medals and conflated events',result:'FAIL'});process.exitCode=1;}
      catch(e){report.steps.push({check:'Reject invented medals and conflated events',result:e.code==='QUALITY_REVIEW'?'pass':'unverified',code:e.code});if(e.code!=='QUALITY_REVIEW')process.exitCode=1;}
      await save();
    }
    if(job.state==='completed'&&!skipVideo){
      // One real source sample: explicitly not a full-video completeness certificate.
      const transcript=JSON.parse(await readFile('audit/real-video/slW0ZIXlXrY/provider-transcript.json','utf8'));
      const chunks=summarySourceChunks(transcript,'detailed');const index=2;
      await new Promise(resolve=>setTimeout(resolve,15000));
      phase='real-video-sample';
      try{
        const draft=await withOwnerAI(owner,()=>generateSummaryPart(chunks[index],'Source language','detailed',index,chunks.length,{source:transcript,boundary:summaryBoundaryContext(chunks,index)}));
        report.videoSample={video:'slW0ZIXlXrY',part:index+1,totalParts:chunks.length,draft,review:'pending'};await save();
        await new Promise(resolve=>setTimeout(resolve,15000));
        await withOwnerAI(owner,()=>checkSummaryPart(draft,chunks[index],summaryBoundaryContext(chunks,index),'detailed'));
        report.videoSample.review='passed automated source review';
      }catch(e){report.videoSample={...report.videoSample,video:'slW0ZIXlXrY',part:index+1,review:'not passed',code:e.code??'UNKNOWN'};process.exitCode=1;}
    }
    if(job.state!=='completed')process.exitCode=1;
  }
} catch(e){report.error={code:e.code??'UNKNOWN'};process.exitCode=1;}
finally {globalThis.fetch=fetchOriginal;await save();console.log(JSON.stringify({event:'live_verification_finished',connections:report.connections,steps:report.steps,videoReview:report.videoSample?.review,error:report.error}));}
