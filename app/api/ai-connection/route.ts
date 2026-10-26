export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { z } from 'zod';
import { guard, body, limited, json, handleError, db, ai } from '@/lib/server';
import { aiContext } from '@/lib/ai-context';
import { AppError } from '@/lib/core';
import { sealKey, personalAIStatus, withAILease } from '@/lib/personal-ai';

const inputSchema = z.object({
  provider: z.enum(['gemini', 'groq', 'openrouter']),
  model: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/),
  key: z.string().trim().min(20).max(512).regex(/^[\x21-\x7E]+$/),
  consent: z.literal(true),
}).strict();
export async function GET(r: Request) {
  try { return json(await personalAIStatus(await guard(r))); } catch (e) { return handleError(e); }
}
export async function POST(r: Request) {
  try {
    const owner = await guard(r, true);
    await limited(`key-connect:${owner}`, 3);
    const input = inputSchema.parse(await body(r, 4096));
    const revision = crypto.randomUUID();
    // Check storage before making a potentially billable validation request.
    const sealed = sealKey(owner, input.provider, input.model, revision, input.key);
    await withAILease(owner, () => aiContext.run({ owner, candidate: input }, async () => {
      const tested = await ai('Return {"ok":true}. This is a connection test.', 'Connection test', z.object({ ok: z.boolean() }), [], 15000);
      if (!tested.ok) throw new AppError(422,'CONNECTION_TEST_FAILED','The model did not pass the connection test. Check the model ID and try again.');
      await db().prepare('INSERT INTO ai_credentials(owner,provider,model,ciphertext,revision,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET provider=excluded.provider,model=excluded.model,ciphertext=excluded.ciphertext,revision=excluded.revision,updated_at=excluded.updated_at')
        .bind(owner, input.provider, input.model, sealed, revision, Date.now()).run();
    }));
    return json(await personalAIStatus(owner));
  } catch (e) { return handleError(e); }
}
export async function DELETE(r: Request) {
  try {
    const owner = await guard(r, true);
    await limited(`key-connect:${owner}`, 3);
    await db().batch([
      db().prepare('DELETE FROM ai_credentials WHERE owner=?').bind(owner),
      db().prepare("UPDATE ai_jobs SET state='cancelled',error_code='AI_CONNECTION_CHANGED',updated_at=? WHERE owner=? AND credential_revision!='shared' AND state IN ('queued','retry','running')").bind(Date.now(), owner),
    ]);
    return json(await personalAIStatus(owner));
  } catch (e) { return handleError(e); }
}
