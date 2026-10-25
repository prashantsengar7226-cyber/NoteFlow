// Explicit, small live generation test. Sends only this synthetic source;
// never reads notes or writes to the application database. Uses provider quota.
import nextEnv from '@next/env';
import ts from 'typescript';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
nextEnv.loadEnvConfig(process.cwd());
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const core=compile(await readFile('lib/core.ts','utf8'));
const provider=compile((await readFile('lib/provider.ts','utf8')).replace("'./core'",JSON.stringify(core)));
const {routedGenerate,providerJson}=await import(provider);
const candidate={provider:'groq',key:process.env.GROQ_API_KEY,model:process.env.GROQ_MODEL};
if(!candidate.key || !candidate.model) throw new Error('Configure Groq before this explicit smoke test.');
let report;
try {
  const result=await routedGenerate([candidate],'Return only JSON with answer (a short string) and segmentIds (array of integers). Use only the source.','[0] Spaced practice helps people remember lessons. Question: What helps people remember lessons?',{},30000);
  const data=await providerJson(result.response);
  const parsed=JSON.parse(data.choices?.[0]?.message?.content??'');
  if(data.choices?.[0]?.finish_reason!=='stop' || typeof parsed.answer!=='string' || !parsed.answer.trim() || !Array.isArray(parsed.segmentIds) || !parsed.segmentIds.length || parsed.segmentIds.some(id=>id!==0)) throw new Error('Invalid smoke result');
  report={passed:true,provider:result.provider,model:data.model??result.model,elapsedMs:result.elapsedMs};
} catch(error) { report={passed:false,code:typeof error.code==='string'?error.code:'INVALID_SMOKE_RESULT'};process.exitCode=1; }
await mkdir('audit',{recursive:true});
await writeFile('audit/provider-smoke.json',JSON.stringify({checkedAt:new Date().toISOString(),...report,scope:'One small live Groq JSON generation using synthetic text; no application data read or modified.'},null,2));
console.log(JSON.stringify(report));
