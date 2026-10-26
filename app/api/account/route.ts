export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { guard, account, db, json, handleError, usage } from '@/lib/server';
import { publicBilling, billingConfig } from '@/lib/billing';
import { FEATURE_LIST, nextReset } from '@/lib/plans';
import { featureRouting, weeklyUsage } from '@/lib/ai-policy';
export async function GET(request: Request) {
  try {
    const owner = await guard(request);
    const user = await getChatGPTUser();
    const plan = await account(owner);
    const profile = await db()
      .prepare('SELECT created_at FROM accounts WHERE owner=?')
      .bind(owner)
      .first<{ created_at: number }>();
    const stats = await db()
      .prepare(
        'SELECT count(*) AS notes, count(DISTINCT folder) AS collections, coalesce(sum(starred),0) AS favorites FROM notes WHERE owner=?',
      )
      .bind(owner)
      .first();
    const history = await db()
      .prepare(
        'SELECT id,amount,currency,state,created_at,updated_at FROM billing_orders WHERE owner=? AND key_mode=? ORDER BY created_at DESC LIMIT 20',
      )
      .bind(owner, billingConfig().keyMode)
      .all();
    return json({
      profile: {
        name: user?.fullName || user?.displayName || 'My account',
        email: user?.email,
        joinedAt: profile?.created_at,
      },
      plan,
      featureRouting: featureRouting(),
      weeklyAI: featureRouting() ? await weeklyUsage(owner) : null,
      billing: publicBilling(),
      features: FEATURE_LIST,
      usage: await usage(owner),
      resetAt: nextReset(),
      stats,
      purchases: history.results,
    });
  } catch (error) {
    return handleError(error);
  }
}
