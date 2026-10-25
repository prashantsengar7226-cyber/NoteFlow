// Explicitly loaded ONLY by workspace-qa.mjs into its separate local process.
// Never imported by application code; no production authentication bypass.
if(process.env.NOTEFLOW_LOCAL_QA !== 'isolated-fixtures' || !process.env.TURSO_DATABASE_URL?.startsWith('file:'))
  throw new Error('Local QA preload requires an isolated file database.');
const users=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
globalThis.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url??String(input));
  if(url.origin!==new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin) throw new Error('External network disabled in local QA');
  if(url.pathname.endsWith('/logout')) return new Response(null,{status:204});
  if(url.pathname.endsWith('/user')) {
    try {
      const token=new Headers(init.headers??input.headers).get('authorization').replace(/^Bearer /,'');
      const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
      if(!users.includes(payload.sub) || payload.exp <= Date.now()/1000 || !token.endsWith('.local-qa-signature')) throw new Error('Invalid fixture');
      return Response.json({id:payload.sub,email:`audit-${users.indexOf(payload.sub)}@example.invalid`,aud:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'});
    } catch { return Response.json({message:'Invalid fixture token'},{status:401}); }
  }
  return Response.json({message:'Only fixture identity verification is supported'},{status:400});
};
