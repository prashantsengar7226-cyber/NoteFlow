import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {env,context} from '../.test-runtime/harness.mjs';
import {vertexEstimate,startVertexUsage,finishVertexUsage,vertexCostReport,costOwnerLabel,syncCloudCosts} from '../.test-runtime/vertex-costs.mjs';
import {GET,POST} from '../.test-runtime/admin-costs.mjs';
import {freeGeminiCandidate} from '../.test-runtime/free-ai.mjs';
const root='20000000-0000-4000-8000-000000000001',admin='20000000-0000-4000-8000-000000000002',other='20000000-0000-4000-8000-000000000003';
const fetchOriginal=globalThis.fetch;
afterEach(()=>{globalThis.fetch=fetchOriginal;});
for(const [owner,role] of [[root,'superuser'],[admin,'admin'],[other,'admin']])await env.DB.prepare('INSERT INTO user_access(owner,role,revision,updated_by,updated_at) VALUES(?,?,?,?,?)').bind(owner,role,crypto.randomUUID(),'test',Date.now()).run();
const month=new Date().toISOString().slice(0,7);
test('shared Gemini fails closed without a verified dedicated key; no fallback candidate',()=>{
  env.GEMINI_API_KEY='paid-existing';env.GEMINI_FREE_TIER_CONFIRMED='true';
  assert.equal(freeGeminiCandidate(),undefined);
  env.GEMINI_FREE_API_KEY='free-fixture';env.GEMINI_FREE_TIER_CONFIRMED='false';assert.equal(freeGeminiCandidate(),undefined);
  env.GEMINI_FREE_TIER_CONFIRMED='true';assert.deepEqual(freeGeminiCandidate(),{provider:'gemini',model:'gemini-3.6-flash',key:'free-fixture'});
  env.GEMINI_FREE_MODEL='../injected';assert.equal(freeGeminiCandidate(),undefined);delete env.GEMINI_FREE_MODEL;
});
test('Vertex estimates charge cached input correctly and include thinking; unknowns never become free',()=>{
  const usage={promptTokenCount:1000,cachedContentTokenCount:200,candidatesTokenCount:100,thoughtsTokenCount:50};
  assert.ok(Math.abs(vertexEstimate('gemini-3.5-flash','global',usage).usd-.00258)<1e-10);
  assert.ok(Math.abs(vertexEstimate('gemini-3.5-flash','us-central1',usage).usd-.002838)<1e-10);
  assert.equal(vertexEstimate('unpriced','global',usage).usd,null);
  assert.equal(vertexEstimate('gemini-3.5-flash','global',{}).usd,null);
  assert.equal(vertexEstimate('gemini-3.5-flash','global',{...usage,cachedContentTokenCount:2000}).usd,null);
  assert.equal(vertexEstimate('gemini-3.5-flash','global',{...usage,thoughtsTokenCount:-1}).usd,null);
  assert.equal(vertexEstimate('gemini-3.8-flash','global',{promptTokenCount:1000000,candidatesTokenCount:0},Date.UTC(2026,11,31)).usd,.75);
  assert.equal(vertexEstimate('gemini-3.8-flash','global',{promptTokenCount:1000000,candidatesTokenCount:0},Date.UTC(2027,0,1)).usd,1.5);
});
test('cost reports isolate admins, include unknown requests and permit all accounts only to superuser',async()=>{
  env.VERTEX_PROJECT_ID='test-project';
  for(const [owner,input] of [[admin,1000],[other,5000]]){
    const id=await startVertexUsage({owner,project:'test-project',model:'gemini-3.5-flash',location:'global',feature:'summary'});
    await finishVertexUsage(id,'gemini-3.5-flash','global',{promptTokenCount:input,candidatesTokenCount:100});
  }
  await startVertexUsage({owner:admin,project:'test-project',model:'gemini-3.5-flash',location:'global',feature:'summary'});
  const own=await vertexCostReport(admin,month),all=await vertexCostReport(root,month);
  assert.equal(own.totals.attempts,2);assert.equal(own.totals.unpriced,1);assert.equal(own.scope,'own');
  assert.deepEqual(own.people.map(r=>r.owner),[admin]);assert.equal(all.totals.attempts,3);assert.equal(all.scope,'all');
  assert.equal(JSON.stringify(own).includes(other),false);
  await assert.rejects(vertexCostReport('ordinary',month),e=>e.status===403);
  await assert.rejects(vertexCostReport(admin,'2026-99'),e=>e.code==='INVALID_MONTH');
});
test('cost endpoints require authentication and superuser for sync; forged scope and CSRF cannot bypass isolation',async()=>{
  const req=new Request('https://app.example/api/admin/costs?month='+month+'&owner='+other);
  assert.equal((await GET(req)).status,401);
  assert.equal((await context.run('ordinary',()=>GET(req))).status,403);
  const own=await context.run(admin,()=>GET(req));assert.equal(own.status,200);assert.equal(JSON.stringify(await own.json()).includes(other),false);
  const post=origin=>new Request('https://app.example/api/admin/costs',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({month})});
  assert.equal((await context.run(admin,()=>POST(post('https://app.example')))).status,403);
  assert.equal((await context.run(root,()=>POST(post('https://evil.example')))).status,403);
});
test('billing sync preserves credits/currency, labels, and atomic month snapshots; incomplete results never replace data',async()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  env.CLOUD_BILLING_SERVICE_ACCOUNT_JSON=JSON.stringify({type:'service_account',client_email:'billing@test-project.iam.gserviceaccount.com',private_key:privateKey.export({format:'pem',type:'pkcs8'})});
  env.CLOUD_BILLING_EXPORT_TABLE='test-project.billing.gcp_billing_export_v1_TEST';env.CLOUD_BILLING_EXPORT_LOCATION='US';
  let complete=true,calls=0;
  globalThis.fetch=async(url,init)=>{
    if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'token',expires_in:3600});
    calls++;assert.equal(url,'https://bigquery.googleapis.com/bigquery/v2/projects/test-project/queries');
    const input=JSON.parse(init.body);assert.equal(input.maximumBytesBilled,'1000000000');assert.equal(input.parameterMode,'NAMED');assert.equal(input.location,'US');
    assert.ok(input.query.includes("service.id='C7E2-9256-1C43'"));
    return Response.json(complete?{jobComplete:true,totalRows:'3',rows:[
      [`${month}-01`,costOwnerLabel(admin),'INR','10','-8','2026-10-28 00:00:00 UTC'],
      [`${month}-01`,costOwnerLabel(other),'INR','20','-4','2026-10-28 00:00:00 UTC'],
      [`${month}-01`,'','USD','3','0','2026-10-28 00:00:00 UTC'],
    ].map(row=>({f:row.map(v=>({v}))}))}:{jobComplete:false});
  };
  await assert.rejects(syncCloudCosts(admin,month),e=>e.status===403);assert.equal(calls,0);
  await syncCloudCosts(root,month);await syncCloudCosts(root,month);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM cloud_cost_rows').first()).n,3);
  const own=await vertexCostReport(admin,month);assert.equal(own.billing.rows.length,1);assert.equal(own.billing.rows[0].credits,-8);assert.equal(own.billing.rows[0].owner,admin);
  assert.equal((await vertexCostReport(root,month)).billing.rows.length,3);
  complete=false;await assert.rejects(syncCloudCosts(root,month),e=>e.code==='BILLING_SYNC_INCOMPLETE');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM cloud_cost_rows').first()).n,3);
  globalThis.fetch=async()=>Response.json({error:{message:'not found'}},{status:404});
  await assert.rejects(syncCloudCosts(root,month),e=>e.code==='BILLING_EXPORT_PENDING');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM cloud_cost_rows').first()).n,3);
  env.CLOUD_BILLING_EXPORT_TABLE='test-project.bad.inject`';await assert.rejects(syncCloudCosts(root,month),e=>e.code==='BILLING_EXPORT_SETUP');
});
