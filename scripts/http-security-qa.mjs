import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base='http://127.0.0.1:3000';
const checks=[];
for (const [path,methods] of [['notes',['GET','POST','PATCH','DELETE']],['actions',['POST']],['account',['GET']],['workspace',['GET']],['diagnostics',['POST']],['transcribe',['POST']],['export',['POST']],['export-batch',['POST']],['billing',['POST']]]) {
  for(const method of methods) {
    const response=await fetch(`${base}/api/${path}`,{method,headers:{origin:base,'content-type':'application/json','oai-authenticated-user-id':'forged-admin',authorization:'Bearer invalid'},...(method==='GET'?{}:{body:'{}'})});
    assert.equal(response.status,401,`${method} ${path}`);
    assert.equal((await response.json()).code,'SIGN_IN_REQUIRED');
    checks.push({method,path,status:response.status,pass:true});
  }
}
for(const [origin,expected] of [[base,303],['https://attacker.example',403],['null',403]]) {
  const r=await fetch(base+'/auth/signout',{method:'POST',headers:{origin},redirect:'manual'});
  assert.equal(r.status,expected);
  checks.push({path:'auth/signout',origin,status:r.status,pass:true});
}
const webhook=await fetch(base+'/api/billing-webhook',{method:'POST',headers:{'content-type':'application/json','x-razorpay-signature':'invalid'},body:'{}'});
assert.ok([400,503].includes(webhook.status));
checks.push({path:'api/billing-webhook',status:webhook.status,pass:true,note:'Live billing disabled; signed/duplicate webhook cases tested locally.'});
for(const p of ['/admin','/api/admin','/.env.local']) {
 const r=await fetch(base+p,{redirect:'manual'});assert.equal(r.status,404);checks.push({path:p,status:r.status,pass:true});
}
await writeFile('audit/http-security.json',JSON.stringify(checks,null,2));
console.log(`${checks.length} HTTP security checks passed.`);
