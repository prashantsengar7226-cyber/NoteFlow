export function launchErrors(env) {
  const errors=[];
  if (env.AI_FEATURE_ROUTING==='true') {
    if(env.VERTEX_ENABLED!=='true') errors.push('Feature routing requires VERTEX_ENABLED=true');
    for(const key of ['VERTEX_PROJECT_ID','VERTEX_MODEL','VERTEX_SERVICE_ACCOUNT_JSON'])
      if(!env[key]?.trim()) errors.push(`Missing ${key} for production Vertex routing`);
    try { const credential=JSON.parse(env.VERTEX_SERVICE_ACCOUNT_JSON || '{}'); if(credential.type!=='service_account' || !credential.client_email || !credential.private_key) throw new Error(); }
    catch { errors.push('Production Vertex requires a service-account credential, not a personal Google login'); }
    if(!Number.isFinite(Date.parse(env.VERTEX_CREDIT_EXPIRES_AT || '')) || Date.parse(env.VERTEX_CREDIT_EXPIRES_AT)<=Date.now()) errors.push('Set a future VERTEX_CREDIT_EXPIRES_AT before credit expiry');
    if(!env.GEMINI_FREE_API_KEY?.trim() || env.GEMINI_FREE_TIER_CONFIRMED!=='true')
      errors.push('Shared Gemini requires GEMINI_FREE_API_KEY from a verified Free-tier project and GEMINI_FREE_TIER_CONFIRMED=true');
    if(env.GEMINI_FREE_MODEL && !/^gemini-[a-zA-Z0-9.-]+$/.test(env.GEMINI_FREE_MODEL))errors.push('Invalid GEMINI_FREE_MODEL');
  }
  if (env.BYOK_ENCRYPTION_KEY && Buffer.from(env.BYOK_ENCRYPTION_KEY,'base64').length!==32)
    errors.push('BYOK_ENCRYPTION_KEY must encode 32 random bytes in base64');
  if (env.QUEUE_SCHEDULER_ENABLED==='true' && (!env.QUEUE_WORKER_SECRET || env.QUEUE_WORKER_SECRET.length<32))
    errors.push('Background recovery requires QUEUE_WORKER_SECRET with at least 32 characters');
  const required=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','TURSO_DATABASE_URL','TURSO_AUTH_TOKEN'];
  for(const key of required) if(!env[key]?.trim()) errors.push(`Missing ${key}`);
  for(const [key,protocol,suffix] of [['NEXT_PUBLIC_SUPABASE_URL','https:','.supabase.co'],['TURSO_DATABASE_URL','libsql:','.turso.io']]) {
    try {
      const url=new URL(env[key]);
      if(url.protocol!==protocol || !url.hostname.endsWith(suffix) || url.username || url.password || url.port || url.search || url.hash || !['','/'].includes(url.pathname)) throw new Error();
    } catch { errors.push(`Invalid ${key}`); }
  }
  if(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_'))
    errors.push('Use a Supabase publishable key in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  for(const key of Object.keys(env)) if(key.startsWith('NEXT_PUBLIC_') && /KEY|TOKEN|SECRET|PASSWORD|DATABASE/.test(key) && !required.includes(key))
    errors.push(`Review unexpected browser-visible setting: ${key}`);
  if(env.NOTEFLOW_LOCAL_QA || env.NOTEFLOW_QA_AI_TEST || env.NOTEFLOW_STAGING || /qa-auth-preload/.test(env.NODE_OPTIONS??''))
    errors.push('Remove local QA/staging settings from deployment');
  if(env.MONETIZATION_MODE!=='free_launch' || env.BILLING_ENABLED!=='false')
    errors.push('First launch requires MONETIZATION_MODE=free_launch and BILLING_ENABLED=false');
  if(['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','PRO_PRICE_PAISE'].some(key=>env[key]?.trim()))
    errors.push('Remove unused payment configuration for the free launch');
  const provider=env.AI_PROVIDER?.trim().toLowerCase() || 'router';
  const keys={gemini:'GEMINI_API_KEY',groq:'GROQ_API_KEY',openrouter:'OPENROUTER_API_KEY'};
  if(!['router',...Object.keys(keys)].includes(provider)) errors.push('Invalid AI_PROVIDER');
  const order=(env.AI_PROVIDER_ORDER || 'gemini,groq,openrouter').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
  if(!order.length || order.some(name=>!Object.hasOwn(keys,name))) errors.push('Invalid AI_PROVIDER_ORDER');
  if(env.AI_FEATURE_ROUTING!=='true'&&!order.some(name=>(provider==='router' || name===provider) && env[keys[name]]?.trim()))
    errors.push('Configure at least one selected AI provider key for launch');
  return errors;
}
