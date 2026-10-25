import { db } from './server';
import { AppError } from './core';

export async function claimImport(owner: string, requestId: string, input: unknown) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(input)),
  );
  const fingerprint = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  const now = Date.now();
  // Completed retries are deduplicated for seven days; abandoned in-flight leases for 15 minutes.
  await db()
    .prepare(
      'DELETE FROM import_requests WHERE owner=? AND (created_at<? OR (note_id IS NULL AND created_at<?))',
    )
    .bind(owner, now - 7 * 86400000, now - 15 * 60000)
    .run();
  const inserted = await db()
    .prepare(
      'INSERT INTO import_requests(owner,request_id,fingerprint,created_at) VALUES(?,?,?,?) ON CONFLICT(owner,request_id) DO NOTHING RETURNING request_id',
    )
    .bind(owner, requestId, fingerprint, now)
    .first();
  if (inserted) return { noteId: null, claimed: true };
  const existing = await db()
    .prepare('SELECT fingerprint,note_id FROM import_requests WHERE owner=? AND request_id=?')
    .bind(owner, requestId)
    .first<{ fingerprint: string; note_id: string | null }>();
  if (existing?.fingerprint !== fingerprint)
    throw new AppError(
      409,
      'IMPORT_CHANGED',
      'This retry has different content. Start a new import.',
    );
  if (!existing.note_id)
    throw new AppError(
      409,
      'IMPORT_IN_PROGRESS',
      'This import is already running. Wait a moment, then retry or check your library.',
    );
  return { noteId: existing.note_id, claimed: false };
}
