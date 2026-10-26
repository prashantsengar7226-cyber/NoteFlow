import { z } from 'zod';
import { AppError } from './core';
export const providerSchema = z.enum(['gemini','groq','openrouter']);
export const modelIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/);
export const apiKeySchema = z.string().trim().min(20).max(512).regex(/^[\x21-\x7E]+$/);
export type AvailableModel = {id:string;name:string;contextWindow?:number;free?:boolean};
type Provider = z.infer<typeof providerSchema>;
const endpoints = {
  gemini:'https://generativelanguage.googleapis.com/v1beta/models',
  groq:'https://api.groq.com/openai/v1/models',
  openrouter:'https://openrouter.ai/api/v1/models/user',
};
// Only catalog metadata crosses this boundary. Never return upstream errors or keys.
export async function listModels(provider:Provider,key:string):Promise<AvailableModel[]> {
  providerSchema.parse(provider);apiKeySchema.parse(key);
  const signal=AbortSignal.timeout(15000);
  const found=new Map<string,AvailableModel>();
  let pageToken='';
  try {
    for(let page=0;page<5;page++) {
      const url=new URL(endpoints[provider]);
      if(provider==='gemini'){url.searchParams.set('pageSize','1000');if(pageToken)url.searchParams.set('pageToken',pageToken);}
      const headers:Record<string,string>=provider==='gemini'?{'x-goog-api-key':key}:{Authorization:`Bearer ${key}`};
      const response=await fetch(url,{headers,signal,redirect:'error',cache:'no-store'});
      if(!response.ok) {
        await response.body?.cancel();
        if(response.status===401||response.status===403)throw new AppError(422,'MODEL_CATALOG_AUTH','The provider rejected this key or its model-list permission. Check your key and provider settings.');
        if(response.status===429)throw new AppError(429,'MODEL_CATALOG_LIMIT','Your provider is limiting model-list requests. Wait and try again.');
        throw new AppError(503,'MODEL_CATALOG_UNAVAILABLE','The provider’s model list is unavailable. Try again shortly.');
      }
      const reader=response.body?.getReader();if(!reader)throw new Error('No catalog');
      const chunks:Uint8Array[]=[];let size=0;
      while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024){await reader.cancel();throw new Error('Catalog too large');}chunks.push(value);}
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const entries=provider==='gemini'?data.models:data.data;
      if(!Array.isArray(entries))throw new Error('Invalid catalog');
      for(const m of entries) {
        if(!m||typeof m!=='object')continue;
        const id=provider==='gemini'&&typeof m.name==='string'?m.name.replace(/^models\//,''):m.id;
        if(!modelIdSchema.safeParse(id).success||id.includes(key))continue;
        if(provider==='gemini'&&(!Array.isArray(m.supportedGenerationMethods)||!m.supportedGenerationMethods.includes('generateContent')||/embedding|image|tts|robotics/i.test(id)))continue;
        if(provider==='groq'&&(m.active===false||/whisper|tts|orpheus|guard/i.test(id)))continue;
        if(provider==='openrouter'&&(!m.architecture?.input_modalities?.includes('text')||!m.architecture?.output_modalities?.includes('text')))continue;
        const rawName=provider==='gemini'?m.displayName:m.name;
        const name=typeof rawName==='string'&&!rawName.includes(key)?rawName.replace(/[\x00-\x1f\x7f]/g,'').slice(0,160):id;
        const context=provider==='gemini'?m.inputTokenLimit:provider==='groq'?m.context_window:m.context_length;
        const model:AvailableModel={id,name:name||id};
        if(Number.isSafeInteger(context)&&context>0)model.contextWindow=context;
        if(provider==='openrouter'&&m.pricing?.prompt!=null&&m.pricing?.completion!=null)model.free=Number(m.pricing.prompt)===0&&Number(m.pricing.completion)===0;
        found.set(id,model);
      }
      if(provider!=='gemini'||!data.nextPageToken)return [...found.values()].sort((a,b)=>a.name.localeCompare(b.name));
      if(typeof data.nextPageToken!=='string'||data.nextPageToken.length>2048||data.nextPageToken===pageToken)throw new Error('Invalid pagination');
      pageToken=data.nextPageToken;
    }
    throw new Error('Catalog pagination exceeded');
  }catch(e){
    if(e instanceof AppError)throw e;
    throw new AppError(503,'MODEL_CATALOG_UNAVAILABLE','Could not load models from your provider. Check your connection and try again.');
  }
}
