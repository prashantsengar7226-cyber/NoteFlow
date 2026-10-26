export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
import {z} from 'zod';
import {guard,body,limited,json,handleError} from '@/lib/server';
import {credential,openKey} from '@/lib/personal-ai';
import {AppError} from '@/lib/core';
import {providerSchema,apiKeySchema,listModels} from '@/lib/ai-models';
const input=z.object({provider:providerSchema,key:apiKeySchema.optional(),revision:z.string().uuid().optional()}).strict()
  .refine(v=>Boolean(v.key)!==Boolean(v.revision),'Use a new key or your saved connection.');
export async function POST(r:Request){
  try{
    const owner=await guard(r,true);
    await limited(`model-list:${owner}`,6);
    const value=input.parse(await body(r,4096));
    let key=value.key;
    if(!key){
      const saved=await credential(owner);
      if(!saved||saved.provider!==value.provider||saved.revision!==value.revision)throw new AppError(409,'AI_CONNECTION_CHANGED','Your saved connection changed. Refresh Settings and try again.');
      key=openKey(saved);
    }
    return json({models:await listModels(value.provider,key)});
  }catch(e){return handleError(e);}
}
