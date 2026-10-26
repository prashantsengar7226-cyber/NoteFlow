// Prints file paths and key names only, never credential values.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const skip=new Set(['node_modules','.next','.next-staging','.release','.git','.test-runtime','.agents','.codex','.vercel','audit','outputs']);
async function files(dir) {
  const all=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    if(skip.has(entry.name) || entry.name.startsWith('.env') || entry.name.endsWith('.tsbuildinfo')) continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) all.push(...await files(full));
    else if(/\.(tsx?|m?js|json|md|sql|ya?ml|html|css|log)$/.test(entry.name)) all.push(full);
  }
  return all;
}
const envText=await readFile('.env.local','utf8');
const env=Object.fromEntries(envText.split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{
  const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2')];
}));
const secrets=Object.entries(env).filter(([k,v])=>v.length>12 && !k.startsWith('NEXT_PUBLIC_') && /KEY|TOKEN|SECRET|DATABASE_URL/.test(k));
const findings=[];
const sourceFiles=await files(root);
for(const file of sourceFiles) {
  const text=await readFile(file,'utf8');
  for(const [key,value] of secrets) if(text.includes(value)) findings.push({file:path.relative(root,file),kind:'configured-secret-match',key});
  for(const [kind,regex] of [['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['provider-key',/\b(?:sk-proj-|sk-or-v1-|gsk_|AIza)[A-Za-z0-9_-]{25,}/]])
    if(regex.test(text)) findings.push({file:path.relative(root,file),kind});
}
const browserFindings=[];
let browserFiles=0;
async function scanBrowser(dir) {
  for(const e of await readdir(dir,{withFileTypes:true})) {
    const f=path.join(dir,e.name);
    if(e.isDirectory()) await scanBrowser(f);
    else if(/\.(js|map|html)$/.test(e.name)) {
      browserFiles++;
      const text=await readFile(f,'utf8');
      for(const [key,value] of secrets) if(text.includes(value)) browserFindings.push({file:path.relative(root,f),key});
    }
  }
}
if(existsSync('.next/static')) await scanBrowser('.next/static');
const ignore=await readFile('.gitignore','utf8');
const report={checkedAt:new Date().toISOString(),sourceFiles:sourceFiles.length,browserFiles,
  configuredSecretsChecked:secrets.map(([k])=>k),findings,browserFindings,
  envIgnored:ignore.split(/\r?\n/).includes('.env*'),gitHistoryAvailable:existsSync('.git'),
  configuredKeys:Object.fromEntries(Object.entries(env).map(([k,v])=>[k,Boolean(v)])),
  limitations:['Pattern and configured-value scan is not exhaustive.','No Git metadata in this extracted source; tracked files and history cannot be audited.','Separate staging and production configuration not available.']};
await mkdir('audit',{recursive:true});
await writeFile('audit/secret-scan.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(findings.length || browserFindings.length) process.exitCode=1;
