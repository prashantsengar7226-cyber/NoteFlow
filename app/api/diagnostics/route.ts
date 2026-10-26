export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { z } from 'zod';
import { withOwnerAI, withAILease } from '@/lib/personal-ai';
import { guard, limited, consumeService, ai, json, handleError } from '@/lib/server';
export async function POST(request: Request) {
  let refund: (() => Promise<void>) | undefined;
  try {
    const owner = await guard(request, true);
    return await withOwnerAI(owner, () => withAILease(owner, async () => {
    await limited('diagnostics:' + owner, 2);
    refund = await consumeService(owner, 'ai');
    const start = Date.now();
    let model = '';
    const result = await ai(
      'Return {answer:string,segmentIds:[number]}. What color is the test square?',
      '[0] The test square is blue.',
      z.object({ answer: z.string(), segmentIds: z.array(z.number().int()) }),
      [{ id: 0, text: 'The test square is blue.', start: 0 }],
      30000,
      (value) => {
        model = value;
      },
    );
    if (!/blue/i.test(result.answer) || !result.segmentIds.includes(0))
      throw new Error('invalid-check');
    return json({ ok: true, model, latencyMs: Date.now() - start, checkedAt: Date.now() });
    }));
  } catch (error) {
    await refund?.().catch(() => {});
    return handleError(error);
  }
}
