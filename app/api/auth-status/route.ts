export const dynamic = 'force-dynamic';
// Public capability flags only. Never expose SMTP credentials or management config.
export async function GET() {
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    if(!base||!key)throw new Error();
    const response=await fetch(base+'/auth/v1/settings',{headers:{apikey:key},signal:AbortSignal.timeout(5000),cache:'no-store'});
    if(!response.ok)throw new Error();
    const settings=await response.json();
    return Response.json({available:true,signupEnabled:settings.disable_signup===false,emailConfirmationRequired:settings.mailer_autoconfirm===false},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({available:false,signupEnabled:false,emailConfirmationRequired:false},{status:503,headers:{'Cache-Control':'no-store'}});}
}
