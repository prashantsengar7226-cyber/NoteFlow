import { redirect } from 'next/navigation';
import { authClient } from '@/lib/supabase-server';

// Keep the shared application interface; Vercel identity comes exclusively from Supabase.
// Never trust oai-authenticated-user-* headers on a self-hosted deployment.
export type ChatGPTUser = { userId: string; displayName: string; email: string; fullName: string | null };
export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const client = await authClient();
  if (!client) return null;
  // Verify against Supabase; cookie payloads and user-editable metadata are not
  // proof of identity. An unavailable auth service must not grant access.
  let result;
  try { result = await client.auth.getUser(); }
  catch { return null; }
  const { data: { user }, error } = result;
  if (error || !user?.id || !user.email || user.is_anonymous || !user.email_confirmed_at) return null;
  const name = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null;
  return { userId: user.id, email: user.email, displayName: name || user.email, fullName: name };
}
export async function requireChatGPTUser(_returnTo: string) {
  const user = await getChatGPTUser();
  if (!user) redirect('/login');
  return user;
}
