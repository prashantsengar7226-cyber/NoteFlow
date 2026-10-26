// Generates server-only local settings without printing secret values.
import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
const filename='.env.local';
let text=await readFile(filename,'utf8');
const values=parseEnv(text);
const additions=[];
for(const name of ['BYOK_ENCRYPTION_KEY','QUEUE_WORKER_SECRET']) {
  if(values[name]?.trim())continue;
  const value=randomBytes(32).toString('base64');
  const pattern=new RegExp(`^${name}=.*$`,'m');
  if(pattern.test(text))text=text.replace(pattern,`${name}=${value}`);
  else additions.push(`${name}=${value}`);
}
if(!values.QUEUE_SCHEDULER_ENABLED)additions.push('QUEUE_SCHEDULER_ENABLED=false');
await writeFile(filename,text.trimEnd()+'\n'+additions.join('\n')+'\n');
console.log('Server-only queue/key-storage settings prepared in .env.local. No secret values printed.');
console.log('Keep the encryption key stable. Copy these settings to Vercel securely; follow PERSONAL-AI-SETUP.md.');
