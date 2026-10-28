import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from './platform';
import { AppError } from './core';
import { aiContext } from './ai-context';
import type { RouterCandidate } from './provider';
import { activeAccess } from './access';

type Credential = { owner: string; provider: RouterCandidate['provider']; model: string; ciphertext: string; revision: string };
function encryptionKey() {
  const value = (env as unknown as Record<string, string>).BYOK_ENCRYPTION_KEY;
  const key = Buffer.from(value || '', 'base64');
  if (key.length !== 32) throw new AppError(503, 'KEY_STORAGE_UNAVAILABLE', 'Personal AI connections are not configured yet.');
  return key;
}
export function personalAIEnabled() {
  try { encryptionKey(); return true; } catch { return false; }
}
export function sealKey(owner: string, provider: string, model: string, revision: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(JSON.stringify([owner, provider, model, revision])));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(v => v.toString('base64')).join('.');
}
export function openKey(row: Credential) {
  try {
    const [iv, tag, ciphertext] = row.ciphertext.split('.').map(v => Buffer.from(v, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAAD(Buffer.from(JSON.stringify([row.owner, row.provider, row.model, row.revision])));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch { throw new AppError(503, 'KEY_UNAVAILABLE', 'Reconnect your personal AI key in Settings.'); }
}
export async function credential(owner: string) {
  return env.DB.prepare('SELECT * FROM ai_credentials WHERE owner=?').bind(owner).first<Credential>();
}
export async function personalAIStatus(owner: string) {
  const row = await credential(owner);
  return { enabled: personalAIEnabled(), mode: row ? 'personal' : 'shared', provider: row?.provider, model: row?.model, revision: row?.revision };
}
export async function withOwnerAI<T>(owner: string, work: () => Promise<T>, revision?: string): Promise<T> {
  const access = await activeAccess(owner);
  const row = await credential(owner);
  if (revision !== undefined && revision !== (row?.revision ?? 'shared'))
    throw new AppError(409, 'AI_CONNECTION_CHANGED', 'Your AI connection changed. Resume to use the current connection.');
  return aiContext.run({ owner, role: access.role, revision: row?.revision ?? 'shared', candidate: row ? {
    provider: row.provider, model: row.model, key: openKey(row),
  } : undefined }, work);
}

/** At most one paid AI operation per account at a time, across instances. */
export async function withAILease<T>(owner: string, work: () => Promise<T>, lane: 'summary' | 'interactive' = 'summary') {
  // One summary and one interactive request may run concurrently. Each lane
  // remains serialized across tabs and serverless instances.
  const leaseOwner = lane === 'summary' ? owner : `interactive:${owner}`;
  const token = crypto.randomUUID();
  const lease = await env.DB.prepare('INSERT INTO ai_owner_leases(owner,token,expires_at) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<=? RETURNING token')
    .bind(leaseOwner, token, Date.now() + 300000, Date.now()).first();
  if (!lease) throw new AppError(409, 'AI_BUSY', 'Another AI task is running. Your queued work will continue automatically.', 30);
  try { return await work(); }
  finally { await env.DB.prepare('DELETE FROM ai_owner_leases WHERE owner=? AND token=?').bind(leaseOwner, token).run(); }
}
