import nextEnv from '@next/env';
import { writeFile } from 'node:fs/promises';
nextEnv.loadEnvConfig(process.cwd());
const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
const headers={apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
const output={};
for(const [name,path] of [['settings','/auth/v1/settings'],['jwks','/auth/v1/.well-known/jwks.json'],['publicSchema','/rest/v1/']]) {
  const response=await fetch(base+path,{headers,signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  if(name==='settings') output.settings={httpStatus:response.status,emailEnabled:data.external?.email,signupDisabled:data.disable_signup,emailAutoConfirm:data.mailer_autoconfirm,enabledProviders:Object.entries(data.external??{}).filter(([,v])=>v===true).map(([k])=>k)};
  if(name==='jwks') output.signingKeys={httpStatus:response.status,algorithms:(data.keys??[]).map(k=>({alg:k.alg,kty:k.kty,crv:k.crv})),note:'Public algorithm metadata only; private keys never requested.'};
  if(name==='publicSchema') output.publicSchema={httpStatus:response.status,paths:Object.keys(data.paths??{}),note:'Anonymous OpenAPI visibility only, not an audit of all table grants or RLS policies.'};
}
await writeFile('audit/auth-settings.json',JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
