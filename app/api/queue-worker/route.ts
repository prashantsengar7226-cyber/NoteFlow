export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { after } from 'next/server';
import { authorizeWorker, runNextJob } from '@/lib/ai-jobs';
import { json, handleError, limited } from '@/lib/server';
import { recordEvent } from '@/lib/operations';
import { env } from '@/lib/platform';
export async function POST(r: Request) {
  try {
    authorizeWorker(r);
    await limited('queue-worker-trigger', 12);
    await recordEvent('scheduler.accepted');
    await env.DB.prepare('DELETE FROM operational_events WHERE created_at<?').bind(Date.now()-30*86400000).run();
    after(async () => {
      try { await runNextJob(); } catch { console.error('summary_worker_failed'); }
    });
    return json({accepted:true},202);
  } catch(e) { return handleError(e); }
}
