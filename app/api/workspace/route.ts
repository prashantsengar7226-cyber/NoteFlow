export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { guard, json, config, handleError, usage, account } from '@/lib/server';
import { nextReset } from '@/lib/plans';
import { publicBilling } from '@/lib/billing';
export async function GET(r: Request) {
  try {
    const owner = await guard(r);
    const c = config();
    const plan = await account(owner);
    return json({
      ai: !!c.aiKey,
      provider: c.provider,
      providers: c.candidates.map(candidate => candidate.provider),
      audio: false,
      youtube: !!c.transcriptKey,
      fallbackModel: c.provider === 'gemini' ? c.fallbackModel : null,
      model: c.aiKey ? c.model : null,
      plan: { id: plan.id, name: plan.name, billingEnabled: publicBilling().enabled },
      access: plan.access,
      billing: publicBilling(),
      limits: plan.limits,
      dailyLimits: plan.daily,
      usage: await usage(owner),
      resetAt: nextReset(),
      version: '0.6.0',
    });
  } catch (e) {
    return handleError(e);
  }
}
