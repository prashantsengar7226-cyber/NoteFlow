import { env } from './platform';
import { AppError } from './core';
import { providerFetch, providerJson } from './provider';
import { usesVertex, vertexToolFeature } from './ai-policy';
import { activeAccess, elevated } from './access';
import { aiContext } from './ai-context';
import { recordEvent } from './operations';
import {googleAccessToken} from './google-auth';
import {startVertexUsage,finishVertexUsage,costOwnerLabel} from './vertex-costs';

const vars = () => env as unknown as Record<string,string | undefined>;
const localADC = () => !vars().VERCEL && vars().VERTEX_ALLOW_LOCAL_ADC === 'true' && !!vars().VERTEX_LOCAL_ADC_PATH;
export function vertexConfig() {
  const v = vars();
  const project = v.VERTEX_PROJECT_ID || '';
  const location = v.VERTEX_LOCATION || 'global';
  const model = vertexToolFeature(aiContext.getStore()?.feature)
    ? (v.VERTEX_TOOLS_MODEL || 'gemini-3.1-flash-lite') : (v.VERTEX_MODEL || '');
  const expires = Date.parse(v.VERTEX_CREDIT_EXPIRES_AT || '');
  if (v.VERTEX_ENABLED !== 'true' || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) ||
      !/^(global|[a-z]+-[a-z]+[0-9])$/.test(location) || !/^gemini-[a-zA-Z0-9.-]+$/.test(model) ||
      !Number.isFinite(expires) || expires <= Date.now() || (!v.VERTEX_SERVICE_ACCOUNT_JSON && !localADC()))
    throw new AppError(503,'VERTEX_NOT_CONFIGURED','The administrator AI connection is unavailable. Check the Vertex configuration. Basic source notes remain available.');
  return { project, location, model, expires };
}
export function vertexReady() { try { vertexConfig(); return true; } catch { return false; } }
export async function vertexGenerate(payload: Record<string,unknown>, timeout: number) {
  // Check at the final paid boundary too, including jobs and internal callers.
  if (!usesVertex()) throw new AppError(403, 'VERTEX_ADMIN_ONLY', 'Paid Vertex AI is available only to an administrator.');
  const owner=aiContext.getStore()!.owner;
  if(!elevated((await activeAccess(owner)).role)) throw new AppError(403,'VERTEX_ADMIN_ONLY','Paid Vertex AI is available only to an administrator.');
  const c = vertexConfig();
  const token = await googleAccessToken();
  // Every upstream attempt (including failed generations and reviews) counts.
  // Administrators have no NoteFlow usage allowance. Keep metering every attempt.
  const day = Math.floor(Date.now()/86400000);
  await env.DB.prepare(`INSERT INTO vertex_budget(project,day,daily_count,total_count) VALUES(?,?,1,1)
    ON CONFLICT(project) DO UPDATE SET day=excluded.day,
    daily_count=CASE WHEN vertex_budget.day=excluded.day THEN daily_count+1 ELSE 1 END,total_count=total_count+1 RETURNING total_count`)
    .bind(c.project,day).first();
  const host = c.location === 'global' ? 'aiplatform.googleapis.com' : `${c.location}-aiplatform.googleapis.com`;
  // Bounded summary chunks retain a separate semantic review. Explicit LOW
  // thinking leaves more of the output budget and deadline for the actual JSON.
  const requestPayload = ['gemini-3.5-flash','gemini-3.8-flash'].includes(c.model) ? {
    ...payload,
    generationConfig: { ...(payload.generationConfig as Record<string,unknown> ?? {}), thinkingConfig: { thinkingLevel: 'LOW' } },
  } : payload;
  const started = Date.now();
  const usageId=await startVertexUsage({owner,project:c.project,model:c.model,location:c.location,feature:aiContext.getStore()?.feature||'summary',operationId:aiContext.getStore()?.operationId});
  try {
  const response = await providerFetch(`https://${host}/v1/projects/${c.project}/locations/${c.location}/publishers/google/models/${c.model}:generateContent`, {
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({...requestPayload,labels:{app:'noteflow',noteflow_owner:costOwnerLabel(owner)}}),
  },'Vertex AI',Math.min(timeout,120000));
  const data=await providerJson(response);
  // Meter even blocked/invalid output: HTTP success can incur costs regardless
  // of whether NoteFlow's semantic validation later accepts the generated text.
  await finishVertexUsage(usageId,c.model,c.location,data.usageMetadata);
  console.info(JSON.stringify({event:'vertex_response',model:c.model,elapsedMs:Date.now()-started,status:response.status}));
  await recordEvent('vertex.response',{actor:owner,status:response.status,resource:c.model});
  return {response:Response.json(data),provider:'gemini' as const,model:c.model,elapsedMs:Date.now()-started};
  } catch(error) {
    // Timeouts can have unknown provider outcomes; never invent a zero charge.
    await finishVertexUsage(usageId,c.model,c.location,undefined,'unknown').catch(()=>console.warn('vertex_usage_update_failed'));
    throw error;
  }
}
