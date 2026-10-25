import { createHash } from 'node:crypto';

const required=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','TURSO_DATABASE_URL','TURSO_AUTH_TOKEN'];
function endpoint(value,protocol,suffix) {
  try {
    const url=new URL(value);
    return url.protocol===protocol && url.hostname.endsWith(suffix) && !url.port &&
      !url.username && !url.password && !url.search && !url.hash && (!url.pathname || url.pathname==='/') ? url.hostname : null;
  } catch { return null; }
}
export function validateStaging(stage,current,template) {
  const errors=[];
  for(const key of Object.keys(stage)) if(!Object.hasOwn(template,key)) errors.push(`Unrecognized staging field: ${key}`);
  for(const key of required) {
    if(!stage[key]?.trim()) errors.push(`Missing staging field: ${key}`);
    if(!current[key]?.trim()) errors.push(`Cannot compare current environment: ${key}`);
    if(stage[key] && stage[key]===current[key]) errors.push(`Current credential or endpoint reused: ${key}`);
  }
  for(const [key,protocol,suffix] of [['NEXT_PUBLIC_SUPABASE_URL','https:','.supabase.co'],['TURSO_DATABASE_URL','libsql:','.turso.io']]) {
    const host=endpoint(stage[key],protocol,suffix);
    if(!host) errors.push(`Invalid staging endpoint: ${key}`);
    if(host && host===endpoint(current[key],protocol,suffix)) errors.push(`Current service host reused: ${key}`);
  }
  if(stage.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !stage.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_'))
    errors.push('Use a publishable Supabase key, not a secret/service-role key.');
  for(const key of Object.keys(template).filter(key=>/KEY|TOKEN|SECRET/.test(key))) {
    if(stage[key] && current[key] && stage[key]===current[key] && !required.includes(key)) errors.push(`Current provider credential reused: ${key}`);
  }
  if(stage.BILLING_ENABLED!=='false' || stage.MONETIZATION_MODE!=='free_launch' || ['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','PRO_PRICE_PAISE'].some(key=>stage[key]))
    errors.push('This staging profile requires free_launch, billing disabled, and blank payment fields.');
  if(!['router','gemini','groq','openrouter'].includes(stage.AI_PROVIDER)) errors.push('Invalid AI_PROVIDER.');
  return errors;
}
export function stagingEnvironment(stage,template,inherited) {
  // Defining every application setting (even empty ones) prevents Next/@next/env
  // from silently falling back to .env.local or inherited provider credentials.
  const result={...inherited};
  for(const key of Object.keys(result)) if(key.startsWith('NEXT_PUBLIC_') || /KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL/.test(key)) delete result[key];
  for(const key of Object.keys(template)) result[key]=stage[key]??'';
  delete result.NODE_OPTIONS;
  delete result.NOTEFLOW_LOCAL_QA;
  delete result.__NEXT_PROCESSED_ENV;
  result.NOTEFLOW_STAGING='isolated';
  result.NODE_ENV='production';
  return result;
}
export function publicFingerprint(stage) {
  return createHash('sha256').update(JSON.stringify(Object.entries(stage).filter(([key])=>key.startsWith('NEXT_PUBLIC_')).sort())).digest('hex');
}
