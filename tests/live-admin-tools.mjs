// Opt-in live smoke test: six synthetic requests, isolated in-memory ledger.
import nextEnv from '@next/env';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {env} from '../.test-runtime/harness.mjs';
import {withOwnerAI} from '../.test-runtime/personal-ai.mjs';
import {withAIFeature} from '../.test-runtime/ai-policy.mjs';
import {generateArtifact} from '../.test-runtime/server.mjs';
nextEnv.loadEnvConfig(process.cwd());
for(const key of ['VERTEX_PROJECT_ID','VERTEX_SERVICE_ACCOUNT_JSON','VERTEX_MODEL','VERTEX_LOCATION','VERTEX_CREDIT_EXPIRES_AT'])env[key]=process.env[key];
env.AI_FEATURE_ROUTING='true';env.VERTEX_ENABLED='true';
const owner='synthetic-admin-tools';
await env.DB.prepare('INSERT INTO user_access(owner,role,revision,updated_by,updated_at) VALUES(?,?,?,?,?)').bind(owner,'admin',crypto.randomUUID(),'local-test',Date.now()).run();
const source=[{id:0,start:0,text:'Students can borrow books for 14 days. The late fee is 2 rupees per day.'},{id:1,start:10,text:'The library opens at 9 am and closes at 5 pm. It is closed on Sundays.'},{id:2,start:20,text:'Students need a library card to borrow books. Reference books must stay inside the library.'}];
const original=globalThis.fetch;let calls=0;const results=[];
globalThis.fetch=async(url,init)=>{
 const host=new URL(url).hostname;
 if(!['oauth2.googleapis.com','aiplatform.googleapis.com'].includes(host))throw Error('Unexpected destination');
 if(host==='aiplatform.googleapis.com'){assert.ok(url.includes('/gemini-3.1-flash-lite:'));if(++calls>6)throw Error('Request budget exceeded');}
 return original(url,init);
};
try{
 for(const feature of ['chat','quiz','flashcards','mindmap','slides','translation']){
  const start=Date.now();
  try{
   const value=await withOwnerAI(owner,()=>withAIFeature(feature,()=>generateArtifact(feature,source,feature==='translation'?'Hindi':'English','How long can students borrow books?',{count:3,difficulty:'easy',focus:'balanced',existing:[]})));
   if(feature==='chat')assert.match(value.answer,/14|fourteen/i);
   results.push({feature,ok:true,elapsedMs:Date.now()-start,value});
  }catch(e){results.push({feature,ok:false,code:e.code||e.name,elapsedMs:Date.now()-start});}
 }
 const ledger=(await env.DB.prepare('SELECT feature,model,state,estimated_usd FROM vertex_usage WHERE owner=?').bind(owner).all()).results;
 assert.equal(ledger.length,calls);assert.ok(ledger.every(r=>r.estimated_usd>0));
 await writeFile('audit/live-admin-tools.json',JSON.stringify({checkedAt:new Date().toISOString(),calls,results,ledger},null,2));
 console.log(JSON.stringify({calls,results:results.map(({value,...r})=>r),ledger}));
 if(results.some(r=>!r.ok))process.exitCode=1;
}finally{globalThis.fetch=original;}
