export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { z } from 'zod';
import { guard, body, json, handleError, limited } from '@/lib/server';
import { createCheckout, verifyCheckout, verifyInput, refreshPurchase } from '@/lib/billing';
export async function POST(request: Request) {
  try {
    const owner = await guard(request, true);
    await limited(`billing:${owner}`, 10);
    const input = await body(request, 8000);
    if (input?.action === 'checkout') {
      z.object({ action: z.literal('checkout') })
        .strict()
        .parse(input);
      return json(await createCheckout(owner));
    }
    if (input?.action === 'refresh') {
      const data = z
        .object({ action: z.literal('refresh'), purchaseId: z.string().uuid() })
        .strict()
        .parse(input);
      return json(await refreshPurchase(owner, data.purchaseId));
    }
    const data = z
      .object({ action: z.literal('verify'), payment: verifyInput })
      .strict()
      .parse(input);
    return json(await verifyCheckout(owner, data.payment));
  } catch (error) {
    return handleError(error);
  }
}
