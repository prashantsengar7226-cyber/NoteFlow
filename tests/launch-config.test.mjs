import test from 'node:test';
import assert from 'node:assert/strict';
import { launchErrors } from '../scripts/launch-config.mjs';
const valid={NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',TURSO_DATABASE_URL:'libsql://fixture.turso.io',TURSO_AUTH_TOKEN:'fixture-token',MONETIZATION_MODE:'free_launch',BILLING_ENABLED:'false',AI_PROVIDER:'router',GROQ_API_KEY:'fixture-key'};
test('free launch accepts configured selected providers',()=>assert.deepEqual(launchErrors(valid),[]));
test('launch rejects missing services, private browser keys and file databases',()=>{
  for(const change of [{TURSO_AUTH_TOKEN:''},{NEXT_PUBLIC_SUPABASE_URL:'http://fixture.supabase.co'},{TURSO_DATABASE_URL:'file:qa.db'},{NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_fixture'},{NEXT_PUBLIC_GROQ_API_KEY:'private'}])
    assert.ok(launchErrors({...valid,...change}).length);
});
test('launch rejects QA preloads and unpaid launch checkout activation',()=>{
  for(const change of [{NOTEFLOW_LOCAL_QA:'isolated-fixtures'},{NOTEFLOW_STAGING:'isolated'},{NODE_OPTIONS:'--import ./scripts/qa-auth-preload.mjs'},{BILLING_ENABLED:'true'},{MONETIZATION_MODE:'one_time'},{RAZORPAY_KEY_SECRET:'private'}])
    assert.ok(launchErrors({...valid,...change}).length);
});
test('launch cannot pass using an unselected provider or invalid routing order',()=>{
  for(const change of [{AI_PROVIDER:'gemini'},{GROQ_API_KEY:''},{AI_PROVIDER_ORDER:'gemini'},{AI_PROVIDER_ORDER:'typo'},{AI_PROVIDER:'unknown'}])
    assert.ok(launchErrors({...valid,...change}).length);
});
