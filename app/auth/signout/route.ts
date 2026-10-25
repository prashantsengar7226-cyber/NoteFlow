import { authClient } from '@/lib/supabase-server';
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  // Next.js can use an internal hostname in request.url. Validate against
  // the host the browser actually requested, as the API write guard does.
  const incomingUrl = new URL(request.url);
  const host = request.headers.get('host');
  if (host) incomingUrl.host = host;
  if (!origin || origin !== incomingUrl.origin || request.headers.get('sec-fetch-site') === 'cross-site')
    return new Response('Cross-site request rejected', { status: 403 });
  try {
    const client = await authClient();
    if (!client || (await client.auth.signOut()).error) throw new Error('Signout unavailable');
  } catch {
    return new Response('Sign out could not be completed. Your session may still be active. Go back and try signing out again.', {
      status: 503, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(null, { status: 303, headers: { Location: '/login', 'Cache-Control': 'no-store' } });
}
