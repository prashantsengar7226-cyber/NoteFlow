import { authClient } from '@/lib/supabase-server';
import { authDestination } from '@/lib/auth-validation';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url), code = url.searchParams.get('code');
  let destination = '/login?auth=invalid-link';
  if (code && code.length <= 2048 && !url.searchParams.has('error')) {
    try {
      const client = await authClient();
      if (client && !(await client.auth.exchangeCodeForSession(code)).error) {
        const { data: { user }, error } = await client.auth.getUser();
        if (!error && user?.email_confirmed_at && !user.is_anonymous) destination = authDestination(url.searchParams.get('next'));
      }
    } catch { /* Tokens and provider errors must never be returned or logged. */ }
  }
  return new Response(null, {status:303, headers:{Location:destination,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}
