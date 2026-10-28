import { createHash, createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { env } from './platform';
import { AppError } from './core';
import { providerFetch, providerJson } from './provider';
const vars = () => env as unknown as Record<string,string | undefined>;
const localADC = () => !vars().VERCEL && vars().VERTEX_ALLOW_LOCAL_ADC === 'true' && !!vars().VERTEX_LOCAL_ADC_PATH;
let cached: { fingerprint:string; token:string; expires:number } | undefined;
export async function googleAccessToken(billing = false) {
  let raw = (billing ? vars().CLOUD_BILLING_SERVICE_ACCOUNT_JSON : undefined) || vars().VERTEX_SERVICE_ACCOUNT_JSON || '';
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
