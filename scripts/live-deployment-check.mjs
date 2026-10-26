// Read-only public deployment and configured-database checks. Never prints credentials.
import nextEnv from '@next/env';
import {createClient} from '@libsql/client';
import {mkdir,writeFile} from 'node:fs/promises';
nextEnv.loadEnvConfig(process.cwd());
const report={checkedAt:new Date().toISOString(),scope:'Public HTTP checks; read-only metadata in the locally configured database. No user records created or changed.',http:[],database:null,github:[]};
await Promise.all(['/login','/api/health','/api/workspace','/api/ai-connection','/api/ai-jobs','/api/queue-worker'].map(async path=>{
  try {
    const response=await fetch('https://note-flow-blue.vercel.app'+path,{method:path.endsWith('queue-worker')?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(20000)});
    const value=response.headers.get('content-type')?.includes('application/json')?await response.json():null;
    report.http.push({path,status:response.status,code:value?.code,health:path==='/api/health'?value:undefined,cacheControl:response.headers.get('cache-control')});
  }catch{report.http.push({path,error:'NETWORK_OR_TIMEOUT'});}
}));
const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try {
  const tables=await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ai_credentials','ai_jobs','ai_owner_leases') ORDER BY name");
  const migrations=await client.execute('SELECT name FROM _noteflow_migrations ORDER BY name');
  report.database={scope:'Locally configured Turso; deployment environment not independently confirmed',featureTables:tables.rows.map(r=>r.name),migrations:migrations.rows.map(r=>r.name)};
}catch{report.database={error:'METADATA_CHECK_FAILED'};}finally{client.close();}
for(const ref of ['main','feat/personal-ai-queue']){
  try {
    const response=await fetch(`https://api.github.com/repos/prashantsengar7226-cyber/NoteFlow/commits/${encodeURIComponent(ref)}/status`,{headers:{accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    report.github.push({ref,httpStatus:response.status,sha:data.sha,state:data.state,statuses:data.statuses?.map(s=>({context:s.context,state:s.state,description:s.description,targetUrl:s.target_url}))});
  }catch{report.github.push({ref,error:'NETWORK_OR_TIMEOUT'});}
}
await mkdir('audit',{recursive:true});
await writeFile('audit/live-deployment.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
