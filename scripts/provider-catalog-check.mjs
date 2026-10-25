import nextEnv from '@next/env';
import {mkdir,writeFile} from 'node:fs/promises';
nextEnv.loadEnvConfig(process.cwd());
const checks=[];
for(const [provider,url,key,model] of [
  ['groq','https://api.groq.com/openai/v1/models',process.env.GROQ_API_KEY,process.env.GROQ_MODEL],
  ['openrouter','https://openrouter.ai/api/v1/models',process.env.OPENROUTER_API_KEY,process.env.OPENROUTER_MODEL],
]) {
  if(!key) {checks.push({provider,status:'not-configured'});continue;}
  try {
    const response=await fetch(url,{headers:{Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    const models=Array.isArray(data.data)?data.data.map(item=>item.id).filter(id=>typeof id==='string'):[];
    checks.push({provider,httpStatus:response.status,configuredModel:model,listed:models.includes(model),
      availableReplacements:models.filter(id=>['openai/gpt-oss-120b','openai/gpt-oss-20b','openrouter/free'].includes(id))});
  } catch { checks.push({provider,status:'catalog-unavailable'}); }
}
await mkdir('audit',{recursive:true});
await writeFile('audit/provider-catalog.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,scope:'Read-only model catalog; no generation or user source sent.'},null,2));
console.log(JSON.stringify(checks,null,2));
