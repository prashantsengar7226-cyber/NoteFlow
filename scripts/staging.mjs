import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { validateStaging,stagingEnvironment,publicFingerprint } from './staging-config.mjs';

const action=process.argv[2]??'check';
if(!['check','migrate','build','start'].includes(action)) {
  console.error('Use: node scripts/staging.mjs check|migrate|build|start');process.exit(1);
}
let stage,current,template;
try {
  [stage,current,template]=await Promise.all(['.env.staging.local','.env.local','.env.example'].map(async file=>parseEnv(await readFile(file,'utf8'))));
} catch {console.error('Required configuration file missing. Follow STAGING-READINESS.md. No action was taken.');process.exit(1);}
const errors=validateStaging(stage,current,template);
await mkdir('audit',{recursive:true});
await writeFile('audit/staging-preflight.json',JSON.stringify({checkedAt:new Date().toISOString(),status:errors.length?'blocked':'local-validation-passed',errors,
  scope:'Offline configuration guard only. Does not authenticate credentials or certify staging services.'},null,2));
if(errors.length) {console.error(errors.join('\n'));process.exit(1);}
console.log('Staging configuration passed local isolation checks. No credentials displayed.');
if(action==='check') process.exit(0);
if(Number(process.versions.node.split('.')[0])!==24) {console.error('Use Node 24 for staging build/start/migrations.');process.exit(1);}
if(action==='start') {
  let marker;
  try {marker=JSON.parse(await readFile('.next-staging/staging-config.json','utf8'));} catch {console.error('Run the staging build before starting.');process.exit(1);}
  if(marker.publicFingerprint!==publicFingerprint(stage)) {console.error('Staging public settings changed. Rebuild staging before starting.');process.exit(1);}
}
const commands={migrate:['scripts/migrate.mjs'],build:['node_modules/next/dist/bin/next','build','--webpack'],start:['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3200']};
const child=spawn(process.execPath,commands[action],{env:stagingEnvironment(stage,template,process.env),stdio:'inherit',windowsHide:true});
child.on('error',()=>{console.error('Staging process could not start.');process.exitCode=1;});
child.on('exit',async code=>{
  if(action==='build' && code===0) await writeFile('.next-staging/staging-config.json',JSON.stringify({publicFingerprint:publicFingerprint(stage)},null,2));
  process.exitCode=code??1;
});
