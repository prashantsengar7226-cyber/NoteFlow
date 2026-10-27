import nextEnv from '@next/env';
import {readFile} from 'node:fs/promises';
nextEnv.loadEnvConfig(process.cwd());
const policy=JSON.parse((await readFile('supabase/auth-policy.json','utf8')).replace(/^\uFEFF/,''));
const apply=process.argv.includes('--apply');
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token){console.log(JSON.stringify({mode:'plan-only',policy,blocked:'Management token and verified SMTP delivery are required to apply. No remote settings changed.'},null,2));if(apply)process.exitCode=1;}
else {
 const project=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
 if(!/^[a-z0-9]{20}$/.test(project))throw Error('Invalid project reference');
 const url=`https://api.supabase.com/v1/projects/${project}/config/auth`;
 const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const response=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Auth configuration read failed: HTTP '+response.status);
 const current=await response.json();
 const smtpConfigured=!!(current.smtp_host&&current.smtp_admin_email&&current.smtp_user);
 const redirects=new Set((current.uri_allow_list||'').split(',').map(s=>s.trim()).filter(Boolean));
 redirects.add(policy.site_url+'/auth/callback');redirects.add(policy.site_url+'/auth/callback?next=/auth/reset-password');
 const patch={...policy,uri_allow_list:[...redirects].join(',')};
 console.log(JSON.stringify({project,smtpConfigured,confirmationCurrentlyRequired:current.mailer_autoconfirm===false,proposed:patch},null,2));
 if(apply){
   if(!smtpConfigured||!process.argv.includes('--delivery-verified'))throw Error('Configure SMTP and verify delivery first. --delivery-verified records the operator delivery check. No settings changed.');
   const updated=await fetch(url,{method:'PATCH',headers,body:JSON.stringify(patch),signal:AbortSignal.timeout(15000)});
   if(!updated.ok)throw Error('Auth configuration update failed: HTTP '+updated.status);
   console.log('Policy applied. Existing auth users and confirmation timestamps were not edited. Recheck live signup, confirmation and reset delivery.');
 }else console.log('Plan only. No remote settings changed.');
}
