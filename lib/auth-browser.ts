import { createBrowserClient } from '@supabase/ssr';

export function browserAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Authentication is not configured.');
  return createBrowserClient(url, key, { global: {
    fetch: (input, init) => fetch(input, { ...init, signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) }),
  } });
}

export function authErrorMessage(error: {code?:string;status?:number}, signup = false) {
  if (error.status === 429 || error.code?.includes('rate_limit')) return 'Too many attempts. Wait a few minutes before trying again.';
  if (error.code === 'weak_password') return 'Choose a longer, unique password. Supabase rejected this password as too weak.';
  if (error.code === 'email_not_confirmed') return 'Confirm your email before signing in. Use Resend confirmation if you need a new link.';
  if (error.code === 'same_password') return 'Choose a password different from your current password.';
  return signup ? 'Could not create the account. Try signing in if you already registered, or try again later.' : 'Could not sign in. Check your email and password and try again.';
}
