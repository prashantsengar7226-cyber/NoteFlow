export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { guard, json, config, handleError, usage, account } from '@/lib/server';
import { nextReset } from '@/lib/plans';
import { publicBilling } from '@/lib/billing';
import { personalAIStatus, withOwnerAI } from '@/lib/personal-ai';
import { featureRouting, weeklyUsage, isAIAdmin } from '@/lib/ai-policy';
import { vertexReady, vertexConfig } from '@/lib/vertex';
export async function GET(r: Request) {
  try {
    const owner = await guard(r);
    return await withOwnerAI(owner, async () => {
    const c = config();
    const connection = await personalAIStatus(owner);
    const plan = await account(owner);
    const vertex = featureRouting() && isAIAdmin(owner) && vertexReady();
    return json({
      accountId: owner,
      summaryConnection: connection.mode === 'personal' ? { provider: 'Personal AI', model: c.model }
        : vertex ? { provider: 'Vertex AI · admin', model: vertexConfig().model } : { provider: 'Free AI', model: c.model },
      ai: !!c.aiKey || vertex,
      featureRouting: featureRouting(),
      weeklyAI: featureRouting() ? await weeklyUsage(owner) : null,
      vertex,
      connection,
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
      dailyLimits: { ...plan.daily, ai: featureRouting() || connection.mode === 'personal' ? null : plan.daily.ai },
      usage: await usage(owner),
      resetAt: nextReset(),
      version: '0.6.0',
    });
    });
  } catch (e) {
    return handleError(e);
  }
}
