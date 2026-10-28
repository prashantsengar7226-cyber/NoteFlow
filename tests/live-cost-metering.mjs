import {writeFile,readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import assert from 'node:assert/strict';
import {env} from '../.test-runtime/harness.mjs';
import {withOwnerAI} from '../.test-runtime/personal-ai.mjs';
import {withAIFeature} from '../.test-runtime/ai-policy.mjs';
import {vertexGenerate} from '../.test-runtime/vertex.mjs';
import {vertexCostReport} from '../.test-runtime/vertex-costs.mjs';
nextEnv.loadEnvConfig(process.cwd());
for(const key of ['VERTEX_PROJECT_ID','VERTEX_SERVICE_ACCOUNT_JSON','VERTEX_MODEL','VERTEX_LOCATION','VERTEX_CREDIT_EXPIRES_AT'])env[key]=process.env[key];
env.AI_FEATURE_ROUTING='true';env.VERTEX_ENABLED='true';
const owner='30000000-0000-4000-8000-000000000001';
await env.DB.prepare('INSERT INTO user_access(owner,role,revision,updated_by,updated_at) VALUES(?,?,?,?,?)').bind(owner,'admin',crypto.randomUUID(),'local-test',Date.now()).run();
const original=globalThis.fetch;let calls=0;
globalThis.fetch=async(url,options)=>{const host=new URL(url).hostname;if(!['oauth2.googleapis.com','aiplatform.googleapis.com'].includes(host))throw Error('Unexpected destination');if(host==='aiplatform.googleapis.com'&&++calls>1)throw Error('One-request budget exceeded');return original(url,options);};
try{
 await withOwnerAI(owner,()=>withAIFeature('summary',()=>vertexGenerate({contents:[{role:'user',parts:[{text:'Return the word OK. This is a synthetic connectivity and usage-metering test.'}]}],generationConfig:{maxOutputTokens:64,temperature:0}},30000)));
 const report=await vertexCostReport(owner,new Date().toISOString().slice(0,7));
 assert.equal(report.totals.attempts,1);assert.equal(report.totals.unpriced,0);assert.ok(Number(report.totals.estimated_usd)>0);
 const result={checkedAt:new Date().toISOString(),scope:'One live Vertex request; synthetic text; in-memory local ledger; estimate not invoice',model:env.VERTEX_MODEL,totals:report.totals};
 await writeFile('audit/live-vertex-cost-metering.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{globalThis.fetch=original;}
