import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from './platform';
import { AppError, sourceNotes, type Segment, type Summary } from './core';
import { db, ownedNote } from './server';
import { nextReset } from './plans';
import { credential, withOwnerAI, withAILease } from './personal-ai';
import { summaryStep } from './summary-progress';

export const jobInput = z.object({
  id: z.string().uuid(),
  language: z.enum(['English','Hindi','Spanish','French','German','Portuguese','Japanese','Korean','Chinese','Arabic','Source language']).default('English'),
  detail: z.enum(['concise','balanced','detailed']).default('balanced'),
}).strict();
export type AIJob = {
  note_title?: string;
  id: string; owner: string; note_id: string; language: string; detail: string; credential_revision: string;
  state: string; failures: number; next_at: number; lease_until: number; lease_token: string | null;
  run_id: string | null; completed_parts: number; total_parts: number; error_code: string | null; created_at: number;
};
const active = "('queued','retry','running')";
export function schedulerConfigured() {
  const vars = env as unknown as Record<string,string>;
  return vars.QUEUE_SCHEDULER_ENABLED === 'true' && (vars.QUEUE_WORKER_SECRET?.length ?? 0) >= 32;
}
export function authorizeWorker(request: Request) {
  const expected = (env as unknown as Record<string,string>).QUEUE_WORKER_SECRET;
  const provided = request.headers.get('authorization') ?? '';
  if (!expected || expected.length < 32 || Buffer.byteLength(provided) !== Buffer.byteLength(`Bearer ${expected}`) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(`Bearer ${expected}`)))
    throw new AppError(401, 'WORKER_AUTH', 'Unauthorized.');
}
export const publicJob = (job: AIJob) => ({
  title: job.note_title ?? 'Summary task',
  id: job.id, noteId: job.note_id, state: job.state, nextAt: job.next_at,
  completedParts: job.completed_parts, totalParts: job.total_parts,
  errorCode: job.error_code, background: schedulerConfigured(),
});
export async function enqueueSummary(owner: string, input: z.infer<typeof jobInput>) {
  const note = await ownedNote(input.id, owner);
  if (note.status !== 'ready') throw new AppError(409, 'NOT_READY', 'Wait for the transcript to finish.');
  const existing = await db().prepare(`SELECT * FROM ai_jobs WHERE owner=? AND note_id=? AND state IN ${active}`).bind(owner, note.id).first<AIJob>();
  if (existing) {
    if (existing.language !== input.language || existing.detail !== input.detail)
      throw new AppError(409, 'JOB_PREFERENCES', 'Cancel the queued summary before changing its language or detail.');
    return { ...existing, note_title: note.title };
  }
  const pending = await db().prepare(`SELECT COUNT(*) AS count FROM ai_jobs WHERE owner=? AND state IN ${active}`).bind(owner).first<{count:number}>();
  if ((pending?.count ?? 0) >= 10) throw new AppError(429, 'QUEUE_FULL', 'Finish or cancel a queued summary before adding another.');
  const connection = await credential(owner);
  const now = Date.now();
  // INSERT OR IGNORE plus the partial unique index makes enqueue replay-safe.
  await db().prepare(`INSERT OR IGNORE INTO ai_jobs(id,owner,note_id,language,detail,credential_revision,next_at,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM ai_jobs WHERE owner=? AND state IN ${active})<10`)
    .bind(crypto.randomUUID(), owner, note.id, input.language, input.detail, connection?.revision ?? 'shared', now, now, now, owner).run();
  const saved = await db().prepare(`SELECT * FROM ai_jobs WHERE owner=? AND note_id=? AND state IN ${active}`).bind(owner, note.id).first<AIJob>();
  if (!saved) throw new AppError(429,'QUEUE_FULL','Your queue is full. Finish or cancel a task first.');
  return { ...saved, note_title: note.title };
}
export async function findJob(owner: string, id: string) {
  const job = await db().prepare('SELECT ai_jobs.*,notes.title AS note_title FROM ai_jobs JOIN notes ON notes.id=ai_jobs.note_id AND notes.owner=ai_jobs.owner WHERE ai_jobs.id=? AND ai_jobs.owner=?').bind(id, owner).first<AIJob>();
  if (!job) throw new AppError(404, 'NOT_FOUND', 'Task not found.');
  return job;
}
export async function cancelJob(owner: string, id: string) {
  await findJob(owner, id);
  await db().prepare(`UPDATE ai_jobs SET state='cancelled',updated_at=? WHERE id=? AND owner=? AND state IN ${active}`).bind(Date.now(), id, owner).run();
}

const fallbackErrors = new Set(['AI_PENDING','DAILY_LIMIT','PROVIDER_LIMIT','PROVIDER_COOLDOWN','AI_NOT_CONFIGURED','KEY_UNAVAILABLE','KEY_STORAGE_UNAVAILABLE',
  'TIMEOUT','PROVIDER_BUSY','PROVIDER_NETWORK','PROVIDER_UNAVAILABLE','PROVIDER_ERROR',
  'PROVIDER_AUTH','PROVIDER_REQUEST','MODEL_UNAVAILABLE','PROVIDER_INPUT_LIMIT','PROVIDER_RESPONSE','PROVIDER_RESPONSE_LIMIT',
  'INVALID_AI_OUTPUT','INVALID_CITATION','OUTPUT_LIMIT','AI_BLOCKED','QUALITY_REVIEW','QUALITY_EVIDENCE']);
async function saveSourceNotes(job: AIJob, token: string, code: string) {
  if (!fallbackErrors.has(code)) return;
  const note = await ownedNote(job.note_id, job.owner);
  const existing = note.summary ? JSON.parse(note.summary) as Summary : null;
  // Never replace a completed AI result or alter its checked parts/draft.
  if (existing?.engine === 'ai' || note.status !== 'ready') return;
  if (code === 'AI_PENDING' && existing) return;
  const summary = existing
    ? { ...existing, fallback: { reason: code } }
    : sourceNotes(JSON.parse(note.transcript) as Segment[], note.title, code);
  // A cancellation, replacement summary, deletion or source edit wins the race.
  await db().prepare(`UPDATE notes SET summary=?,updated_at=? WHERE id=? AND owner=? AND status='ready'
    AND summary IS ? AND transcript=? AND EXISTS
    (SELECT 1 FROM ai_jobs WHERE id=? AND owner=? AND state='running' AND lease_token=?)`)
    .bind(JSON.stringify(summary), Date.now(), note.id, job.owner, note.summary, note.transcript, job.id, job.owner, token).run();
}

/** One durable generation OR source-review step per invocation. */
export async function runNextJob(owner?: string, id?: string) {
  const now = Date.now();
  const job = await db().prepare(`SELECT * FROM ai_jobs WHERE state IN ${active} AND next_at<=? AND lease_until<=? ${owner ? 'AND owner=?' : ''} ${id ? 'AND id=?' : ''} ORDER BY next_at,created_at LIMIT 1`)
    .bind(now, now, ...(owner ? [owner] : []), ...(id ? [id] : [])).first<AIJob>();
  if (!job) return;
  const token = crypto.randomUUID();
  const claimed = await db().prepare(`UPDATE ai_jobs SET state='running',lease_token=?,lease_until=?,updated_at=? WHERE id=? AND state IN ${active} AND lease_until<=? RETURNING id`)
    .bind(token, now + 300000, now, job.id, now).first();
  if (!claimed) return;
  // An expired running lease means the previous process died before settling.
  if (job.state === 'running') job.failures++;
  const update = async (state: string, error: string | null, nextAt: number, failures: number, runId = job.run_id, completed = job.completed_parts, total = job.total_parts) => {
    await db().prepare("UPDATE ai_jobs SET state=?,error_code=?,next_at=?,failures=?,lease_until=0,lease_token=NULL,run_id=?,completed_parts=?,total_parts=?,updated_at=? WHERE id=? AND lease_token=? AND state='running'")
      .bind(state,error,nextAt,failures,runId,completed,total,Date.now(),job.id,token).run();
  };
  try {
    if (job.failures >= 3) throw new AppError(409,'JOB_INTERRUPTED','Repeated worker interruptions. Resume explicitly to continue.');
    if (now - job.created_at > 7 * 86400000) throw new AppError(409,'JOB_EXPIRED','This task expired. Resume explicitly to continue.');
    const result = await withOwnerAI(job.owner, () => withAILease(job.owner, async () => {
      const live = await db().prepare("SELECT id FROM ai_jobs WHERE id=? AND state='running' AND lease_token=?").bind(job.id,token).first();
      if (!live) throw new AppError(409,'JOB_CANCELLED','Task cancelled.');
      // Make the source usable before waiting on a remote provider. This local
      // result never marks the AI job complete and costs no generation quota.
      await saveSourceNotes(job, token, 'AI_PENDING');
      const note = await ownedNote(job.note_id, job.owner);
      return summaryStep(note, job.owner, JSON.parse(note.transcript) as Segment[], {
        language: job.language, detail: job.detail, runId: job.run_id ?? undefined,
        completedParts: job.run_id ? job.completed_parts : undefined, qualityCheck: true,
      });
    }), job.credential_revision);
    await update('result' in result ? 'completed' : 'queued', null, Date.now() + 15000, result.completedParts > job.completed_parts ? 0 : job.failures, result.runId, result.completedParts, result.totalParts);
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'INTERNAL';
    await saveSourceNotes(job, token, code).catch(() => console.error(JSON.stringify({event:'source_notes_save_failed'})));
    const waiting = ['DAILY_LIMIT','PROVIDER_LIMIT','PROVIDER_COOLDOWN','AI_BUSY','SUMMARY_IN_PROGRESS'].includes(code);
    const retryable = waiting || ['TIMEOUT','PROVIDER_BUSY','PROVIDER_NETWORK','PROVIDER_UNAVAILABLE','UPSTREAM_ERROR','PROVIDER_ERROR','NETWORK_ERROR','INVALID_AI_OUTPUT','INVALID_CITATION','OUTPUT_LIMIT','QUALITY_REVIEW','QUALITY_EVIDENCE','INTERNAL'].includes(code);
    const failures = job.failures + (waiting ? 0 : 1);
    const delay = error instanceof AppError && error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : Math.min(900000, 60000 * 2 ** failures);
    // A content correction is not a provider outage. Repair promptly within
    // the same three-failure budget; retain backoff for transport/quota errors.
    const nextAt = code === 'DAILY_LIMIT' ? nextReset() + 1000 : Date.now() +
      (code === 'QUALITY_REVIEW' ? Math.max(15000, error instanceof AppError && error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : 0) : Math.max(30000, delay));
    await update(retryable && failures < 3 ? 'retry' : 'failed', code, nextAt, failures);
    console.warn(JSON.stringify({event:'summary_queue_step',state:retryable && failures < 3 ? 'retry':'failed',code}));
  }
}
