import { createHash, createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { env } from './platform';
import { AppError } from './core';
import { providerFetch, providerJson } from './provider';
import { usesVertex } from './ai-policy';

const vars = () => env as unknown as Record<string,string | undefined>;
const localADC = () => !vars().VERCEL && vars().VERTEX_ALLOW_LOCAL_ADC === 'true' && !!vars().VERTEX_LOCAL_ADC_PATH;
export function vertexConfig() {
  const v = vars();
  const project = v.VERTEX_PROJECT_ID || '';
  const location = v.VERTEX_LOCATION || 'global';
  const model = v.VERTEX_MODEL || '';
  const expires = Date.parse(v.VERTEX_CREDIT_EXPIRES_AT || '');
  const daily = Number(v.VERTEX_DAILY_REQUEST_CAP || 0);
  const total = Number(v.VERTEX_TOTAL_REQUEST_CAP || 0);
  if (v.VERTEX_ENABLED !== 'true' || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) ||
      !/^(global|[a-z]+-[a-z]+[0-9])$/.test(location) || !/^gemini-[a-zA-Z0-9.-]+$/.test(model) ||
      !Number.isFinite(expires) || expires <= Date.now() || !Number.isSafeInteger(daily) || daily < 1 ||
      !Number.isSafeInteger(total) || total < 1 || (!v.VERTEX_SERVICE_ACCOUNT_JSON && !localADC()))
    throw new AppError(503,'VERTEX_NOT_CONFIGURED','AI summaries and insights are not available yet. Basic source notes and smaller tools remain available.');
  return { project, location, model, daily, total, expires };
}
export function vertexReady() { try { vertexConfig(); return true; } catch { return false; } }
let cached: { fingerprint:string; token:string; expires:number } | undefined;
async function accessToken() {
  let raw = vars().VERTEX_SERVICE_ACCOUNT_JSON || '';
  const local = !raw && localADC();
  if (local) {
    try { raw = await readFile(vars().VERTEX_LOCAL_ADC_PATH!, 'utf8'); }
    catch { throw new AppError(503,'VERTEX_AUTH','The local Google Cloud credential could not be read.'); }
  }
  const fingerprint = createHash('sha256').update(raw).digest('hex');
  if (cached?.fingerprint === fingerprint && cached.expires > Date.now() + 60000) return cached.token;
  let body: URLSearchParams;
  try {
    const c = JSON.parse(raw);
    if (local && c.type === 'authorized_user' && typeof c.refresh_token === 'string' && typeof c.client_id === 'string' && typeof c.client_secret === 'string') {
      body = new URLSearchParams({grant_type:'refresh_token',refresh_token:c.refresh_token,client_id:c.client_id,client_secret:c.client_secret});
    } else {
    if (c.type !== 'service_account' || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(c.client_email)) throw new Error();
    const now = Math.floor(Date.now()/1000);
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const unsigned = `${encode({alg:'RS256',typ:'JWT'})}.${encode({iss:c.client_email,scope:'https://www.googleapis.com/auth/cloud-platform',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})}`;
    const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(c.private_key,'base64url')}`;
    body = new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});
    }
  } catch { throw new AppError(503,'VERTEX_AUTH','The site owner needs to configure Vertex authentication.'); }
  const response = await providerFetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body }, 'Vertex authentication', 10000);
  const data = await providerJson(response, 16000);
  if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number' || data.expires_in <= 0)
    throw new AppError(503,'VERTEX_AUTH','Vertex authentication is unavailable.');
  cached = {fingerprint,token:data.access_token,expires:Date.now()+Math.min(3600,data.expires_in)*1000};
  return cached.token;
}
export async function vertexGenerate(payload: Record<string,unknown>, timeout: number) {
  // Check at the final paid boundary too, including jobs and internal callers.
  if (!usesVertex()) throw new AppError(403, 'VERTEX_ADMIN_ONLY', 'Paid Vertex AI is available only to an administrator.');
  const c = vertexConfig();
  const token = await accessToken();
  // Every upstream attempt (including failed generations and reviews) counts.
  // This circuit is site-wide and applies to admins too. It is not a billing guarantee.
  const day = Math.floor(Date.now()/86400000);
  const reserved = await env.DB.prepare(`INSERT INTO vertex_budget(project,day,daily_count,total_count) VALUES(?,?,1,1)
    ON CONFLICT(project) DO UPDATE SET day=excluded.day,
    daily_count=CASE WHEN vertex_budget.day=excluded.day THEN daily_count+1 ELSE 1 END,total_count=total_count+1
    WHERE total_count<? AND (vertex_budget.day!=excluded.day OR daily_count<?) RETURNING total_count`)
    .bind(c.project,day,c.total,c.daily).first();
  if (!reserved) throw new AppError(429,'VERTEX_CAP','The site AI processing budget is paused. Your source notes are still available.',Math.ceil(((day+1)*86400000-Date.now())/1000));
  const host = c.location === 'global' ? 'aiplatform.googleapis.com' : `${c.location}-aiplatform.googleapis.com`;
  // Bounded summary chunks retain a separate semantic review. Explicit LOW
  // thinking leaves more of the output budget and deadline for the actual JSON.
  const requestPayload = ['gemini-3.5-flash','gemini-3.8-flash'].includes(c.model) ? {
    ...payload,
    generationConfig: { ...(payload.generationConfig as Record<string,unknown> ?? {}), thinkingConfig: { thinkingLevel: 'LOW' } },
  } : payload;
  const started = Date.now();
  const response = await providerFetch(`https://${host}/v1/projects/${c.project}/locations/${c.location}/publishers/google/models/${c.model}:generateContent`, {
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(requestPayload),
  },'Vertex AI',Math.min(timeout,120000));
  console.info(JSON.stringify({event:'vertex_response',model:c.model,elapsedMs:Date.now()-started,status:response.status}));
  return {response,provider:'gemini' as const,model:c.model,elapsedMs:Date.now()-started};
}
