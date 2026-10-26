export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { after } from 'next/server';
import { z } from 'zod';
import { guard, body, limited, json, handleError, db } from '@/lib/server';
import { enqueueSummary, jobInput, publicJob, findJob, cancelJob, runNextJob, type AIJob } from '@/lib/ai-jobs';
function kick(owner: string, id: string) {
  after(async () => { try { await runNextJob(owner, id); } catch { console.error('summary_worker_failed'); } });
}
export async function POST(r: Request) {
  try {
    const owner = await guard(r, true);
    await limited(`job-write:${owner}`, 20);
    const value = await body(r, 4096);
    if (value && typeof value === 'object' && 'jobId' in value) {
      const {jobId} = z.object({jobId:z.string().uuid()}).strict().parse(value);
      const job = await findJob(owner, jobId);
      kick(owner, jobId);
      return json({job:publicJob(job)});
    }
    const job = await enqueueSummary(owner, jobInput.parse(value));
    kick(owner, job.id);
    return json({job:publicJob(job)}, 202);
  } catch(e) { return handleError(e); }
}
export async function GET(r: Request) {
  try {
    const owner = await guard(r);
    const id = new URL(r.url).searchParams.get('id');
    if (id) return json({job:publicJob(await findJob(owner,z.string().uuid().parse(id)))});
    const jobs = await db().prepare("SELECT ai_jobs.*,notes.title AS note_title FROM ai_jobs JOIN notes ON notes.id=ai_jobs.note_id AND notes.owner=ai_jobs.owner WHERE ai_jobs.owner=? AND state IN ('queued','running','retry') ORDER BY ai_jobs.created_at LIMIT 10").bind(owner).all<AIJob>();
    return json({jobs:jobs.results.map(publicJob)});
  } catch(e) { return handleError(e); }
}
export async function DELETE(r: Request) {
  try {
    const owner = await guard(r,true);
    await limited(`job-write:${owner}`,20);
    const {jobId} = z.object({jobId:z.string().uuid()}).strict().parse(await body(r,1024));
    await cancelJob(owner,jobId);
    return json({ok:true});
  } catch(e) { return handleError(e); }
}
