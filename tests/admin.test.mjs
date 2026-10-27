import test from 'node:test';
import assert from 'node:assert/strict';
import {env,context} from '../.test-runtime/harness.mjs';
import {GET,POST} from '../.test-runtime/admin.mjs';
import {accessFor} from '../.test-runtime/access.mjs';
import {withOwnerAI} from '../.test-runtime/personal-ai.mjs';
import {withAIFeature,usesVertex} from '../.test-runtime/ai-policy.mjs';
import {guard,consumeService,capacity,handleError} from '../.test-runtime/server.mjs';
const root='10000000-0000-4000-8000-000000000001',admin='10000000-0000-4000-8000-000000000002',user='10000000-0000-4000-8000-000000000003';
const req=(method='GET',payload,origin='https://app.example',query='')=>new Request('https://app.example/api/admin'+query,{method,headers:{origin,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
const seed=async(owner,role)=>env.DB.prepare('INSERT INTO user_access(owner,role,revision,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET role=excluded.role,suspended=0,revision=excluded.revision').bind(owner,role,crypto.randomUUID(),'test',Date.now()).run();
await seed(root,'superuser');await seed(admin,'admin');await seed(user,'user');
const call=(who,method,payload,origin,query)=>context.run(who,()=>method==='GET'?GET(req(method,payload,origin,query)):POST(req(method,payload,origin,query)));
test('admin endpoints deny anonymous and regular users; legacy env grants no role',async()=>{
  assert.equal((await GET(req())).status,401);
  env.AI_ADMIN_USER_IDS=user;
  assert.equal((await call(user,'GET')).status,403);
  assert.equal((await accessFor('legacy-unregistered')).role,'user');
  assert.equal((await call(admin,'GET')).status,200);
  assert.equal((await call(admin,'GET',null,null,'?view=database')).status,403);
  assert.equal((await call(root,'GET',null,null,'?view=database')).status,200);
});
test('only superuser grants roles; CSRF, tampered payloads and stale changes are rejected atomically',async()=>{
  const before=await accessFor(user),payload={action:'access',owner:user,role:'admin',suspended:false,revision:before.revision,reason:'Trusted support operator'};
  const count=async()=>(await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_audit').first()).n;
  const initial=await count();
  assert.equal((await call(admin,'POST',payload)).status,403);
  assert.equal((await call(root,'POST',payload,'https://evil.example')).status,403);
  assert.equal((await call(root,'POST',{...payload,role:'superuser'})).status,400);
  assert.equal((await call(root,'POST',{...payload,injectedSql:'DROP TABLE notes'})).status,400);
  assert.equal(await count(),initial);
  assert.equal((await call(root,'POST',payload)).status,200);
  assert.equal((await accessFor(user)).role,'admin');assert.equal(await count(),initial+1);
  assert.equal((await call(root,'POST',payload)).status,409);assert.equal(await count(),initial+1);
  const own={...payload,owner:root,revision:(await accessFor(root)).revision};
  assert.equal((await call(root,'POST',own)).status,409);
});
test('demotion immediately removes dashboard and paid routing; suspension blocks ordinary endpoints and AI workers',async()=>{
  env.AI_FEATURE_ROUTING='true';
  await withOwnerAI(user,()=>withAIFeature('summary',async()=>assert.equal(usesVertex(),true)));
  const payload={action:'access',owner:user,role:'user',suspended:false,revision:(await accessFor(user)).revision,reason:'Remove temporary access'};
  assert.equal((await call(root,'POST',payload)).status,200);
  assert.equal((await call(user,'GET')).status,403);
  await withOwnerAI(user,()=>withAIFeature('summary',async()=>assert.equal(usesVertex(),false)));
  assert.equal((await call(root,'POST',{...payload,suspended:true,revision:(await accessFor(user)).revision})).status,200);
  await assert.rejects(context.run(user,()=>guard(req())),e=>e.code==='ACCOUNT_SUSPENDED');
  await assert.rejects(withOwnerAI(user,async()=>{}),e=>e.code==='ACCOUNT_SUSPENDED');
  assert.equal((await call(root,'POST',{...payload,revision:(await accessFor(user)).revision})).status,200);
});
test('last superuser and append-only audit records are protected in the database',async()=>{
  await assert.rejects(env.DB.prepare('DELETE FROM user_access WHERE owner=?').bind(root).run(),/Last superuser/);
  await assert.rejects(env.DB.prepare("UPDATE user_access SET role='user' WHERE owner=?").bind(root).run(),/Last superuser/);
  await assert.rejects(env.DB.prepare('UPDATE user_access SET suspended=1 WHERE owner=?').bind(root).run(),/Last superuser/);
  await assert.rejects(env.DB.prepare("UPDATE admin_audit SET reason='changed'").run(),/append-only/);
  await assert.rejects(env.DB.prepare('DELETE FROM admin_audit').run(),/append-only/);
});
test('admin feature allowances are uncapped but normal user allowances remain enforced',async()=>{
  env.AI_FEATURE_ROUTING='false';
  for(let i=0;i<25;i++)await consumeService(admin,'youtube');
  for(let i=0;i<3;i++)await consumeService(user,'youtube');
  await assert.rejects(consumeService(user,'youtube'),e=>e.code==='DAILY_LIMIT');
  await capacity(admin);
});
test('operational errors expose only safe codes, never error contents; searches cannot inject SQL',async()=>{
  await handleError(new Error('secret-credential source-transcript SELECT password'));
  const r=await call(root,'GET',null,null,'?view=events');const data=await r.text();
  assert.ok(!data.includes('secret-credential'));assert.ok(!data.includes('source-transcript'));assert.ok(!data.includes('SELECT password'));
  assert.equal((await call(root,'GET',null,null,'?view=users&search='+encodeURIComponent("' OR 1=1 --"))).status,200);
  assert.equal((await call(root,'GET',null,null,'?view=ai_credentials')).status,400);
  assert.equal((await call(root,'GET',null,null,'?page=-1')).status,400);
});
test('job retry/cancel is state-aware, audited and cannot overwrite a worker lease',async()=>{
  const note=crypto.randomUUID(),job=crypto.randomUUID(),now=Date.now();
  await env.DB.prepare("INSERT INTO notes(id,owner,title,source,created_at,updated_at) VALUES(?,?,'fixture','text',?,?)").bind(note,user,now,now).run();
  await env.DB.prepare("INSERT INTO ai_jobs(id,owner,note_id,language,detail,credential_revision,state,next_at,created_at,updated_at,lease_until) VALUES(?,?,?,'English','balanced','shared','failed',?,?,?,?)").bind(job,user,note,now,now,now,now+300000).run();
  const payload={action:'retry',jobId:job,reason:'Retry after provider recovery'};
  assert.equal((await call(user,'POST',payload)).status,403);
  assert.equal((await call(admin,'POST',payload)).status,409);
  await env.DB.prepare('UPDATE ai_jobs SET lease_until=0 WHERE id=?').bind(job).run();
  assert.equal((await call(admin,'POST',payload)).status,200);
  assert.equal((await call(admin,'POST',payload)).status,409);
  assert.equal((await call(admin,'POST',{...payload,action:'cancel'})).status,200);
  assert.equal((await env.DB.prepare('SELECT state FROM ai_jobs WHERE id=?').bind(job).first()).state,'cancelled');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_audit WHERE target=?').bind(job).first()).n,2);
});

test('overview daily series is bounded, zero-filled and rejects arbitrary date ranges',async()=>{
 for(const range of ['7','30']){const r=await call(root,'GET',null,null,'?days='+range);assert.equal(r.status,200);const data=(await r.json()).data;assert.equal(data.days.length,Number(range));assert.equal(data.days.at(-1).day,new Date().toISOString().slice(0,10));assert.ok(data.days.every(row=>Number.isInteger(row.count)&&row.count>=0));}
 assert.equal((await call(root,'GET',null,null,'?days=999999')).status,400);
});
