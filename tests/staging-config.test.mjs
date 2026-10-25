import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { validateStaging,stagingEnvironment,publicFingerprint } from '../scripts/staging-config.mjs';
const template=parseEnv(await readFile('.env.example','utf8'));
const current={NEXT_PUBLIC_SUPABASE_URL:'https://current.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_current',TURSO_DATABASE_URL:'libsql://current.turso.io',TURSO_AUTH_TOKEN:'current-token',GROQ_API_KEY:'current-groq'};
const valid={...parseEnv(await readFile('deployment/staging.env.example','utf8')),NEXT_PUBLIC_SUPABASE_URL:'https://staging.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_staging',TURSO_DATABASE_URL:'libsql://staging.turso.io',TURSO_AUTH_TOKEN:'staging-token'};
test('separate staging config passes without changing current configuration',()=>{
  assert.deepEqual(validateStaging(valid,current,template),[]);
  assert.equal(current.TURSO_AUTH_TOKEN,'current-token');
});
test('missing staging credentials fail closed',()=>{
  for(const key of Object.keys(current).filter(k=>k!=='GROQ_API_KEY')) {
    assert.ok(validateStaging({...valid,[key]:''},current,template).length>0);
    assert.ok(validateStaging(valid,{...current,[key]:''},template).length>0);
  }
});
test('current hosts and credentials cannot be reused even with URL casing or a trailing slash',()=>{
  for(const key of Object.keys(current)) assert.ok(validateStaging({...valid,[key]:current[key]},current,template).length>0);
  assert.ok(validateStaging({...valid,NEXT_PUBLIC_SUPABASE_URL:'https://CURRENT.supabase.co/'},current,template).length>0);
  assert.ok(validateStaging({...valid,TURSO_DATABASE_URL:'libsql://current.turso.io/'},current,template).length>0);
});
test('secret browser keys, alternate endpoints and active billing are blocked',()=>{
  for(const change of [
    {NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_fixture'},
    {NEXT_PUBLIC_SUPABASE_URL:'http://staging.supabase.co'},
    {TURSO_DATABASE_URL:'file:production.db'},
    {TURSO_DATABASE_URL:'libsql://user:password@staging.turso.io'},
    {BILLING_ENABLED:'true'}, {RAZORPAY_KEY_ID:'rzp_live_fixture'}, {NODE_OPTIONS:'--import unsafe'},
  ]) assert.ok(validateStaging({...valid,...change},current,template).length>0);
});
test('staging child environment cannot fall back to inherited application credentials or QA preload',()=>{
  const env=stagingEnvironment(valid,template,{PATH:'test-path',GROQ_API_KEY:'production-groq',TURSO_AUTH_TOKEN:'production-token',NEXT_PUBLIC_OTHER_SECRET:'secret',NODE_OPTIONS:'--import qa',NOTEFLOW_LOCAL_QA:'isolated-fixtures'});
  assert.equal(env.PATH,'test-path');
  assert.equal(env.GROQ_API_KEY,'');
  assert.equal(env.TURSO_AUTH_TOKEN,'staging-token');
  assert.equal(env.NEXT_PUBLIC_OTHER_SECRET,undefined);
  assert.equal(env.NODE_OPTIONS,undefined);
  assert.equal(env.NOTEFLOW_LOCAL_QA,undefined);
  assert.equal(env.NOTEFLOW_STAGING,'isolated');
  assert.ok(Object.keys(template).every(key=>Object.hasOwn(env,key)));
});
test('build fingerprint changes for browser configuration but not rotated server token',()=>{
  assert.notEqual(publicFingerprint(valid),publicFingerprint({...valid,NEXT_PUBLIC_SUPABASE_URL:'https://new-stage.supabase.co'}));
  assert.equal(publicFingerprint(valid),publicFingerprint({...valid,TURSO_AUTH_TOKEN:'rotated-token'}));
});
