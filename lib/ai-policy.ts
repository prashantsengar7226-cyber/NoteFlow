import { env } from './platform';
import { aiContext, usesPersonalAI } from './ai-context';
import { AppError } from './core';
import { activeAccess, elevated } from './access';

const vars = () => env as unknown as Record<string, string | undefined>;
export const featureRouting = () => vars().AI_FEATURE_ROUTING === 'true';
export const isAIAdmin = (owner: string) => {
  const scope=aiContext.getStore();
  return scope?.owner===owner && !!scope.role && elevated(scope.role);
};
export const premiumFeature = (feature?: string) => feature === 'summary' || feature === 'insights';
export const vertexToolFeature = (feature?: string) => ['chat','quiz','flashcards','mindmap','slides','translation'].includes(feature || '');
export const usesVertex = () => {
  const scope = aiContext.getStore();
  return !!scope && featureRouting() && isAIAdmin(scope.owner) && (premiumFeature(scope.feature) || vertexToolFeature(scope.feature)) && !scope.candidate;
};
export function withAIFeature<T>(feature: string, work: () => Promise<T>) {
  const scope = aiContext.getStore();
  if (!scope) throw new AppError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
  return aiContext.run({ ...scope, feature }, work);
}
export function weekWindow(now = Date.now()) {
  const offset = 330 * 60000;
  const local = new Date(now + offset);
  const day = (local.getUTCDay() + 6) % 7;
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day) - offset;
  return { start, resetAt: start + 7 * 86400000 };
}
export async function weeklyUsage(owner: string) {
  await releaseStoppedOperations(owner);
  const { start, resetAt } = weekWindow();
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM ai_operations WHERE owner=? AND week=? AND state IN ('reserved','completed')").bind(owner, start).first<{count:number}>();
  return { used: row?.count ?? 0, limit: null, resetAt };
}
// One durable reservation per logical run, including all its chunks and retries.
export async function reserveOperation(owner: string, id: string, feature: string) {
  if (!featureRouting() || !elevated((await activeAccess(owner)).role) || !premiumFeature(feature) || usesPersonalAI(owner)) return;
  await releaseStoppedOperations(owner);
  const { start } = weekWindow();
  // Admin runs are tracked for audit, not capped by a product allowance.
  await env.DB.prepare(`INSERT INTO ai_operations(owner,id,feature,week,state,created_at)
    VALUES(?,?,?,?,'reserved',?)
    ON CONFLICT(owner,id) DO UPDATE SET state='reserved',week=excluded.week WHERE ai_operations.state='released'`)
    .bind(owner,id,feature,start,Date.now()).run();
}
export async function settleOperation(owner: string, id: string, completed: boolean) {
  await env.DB.prepare("UPDATE ai_operations SET state=? WHERE owner=? AND id=? AND state='reserved'").bind(completed?'completed':'released',owner,id).run();
}
export async function releaseStoppedOperations(owner: string) {
  await env.DB.prepare(`UPDATE ai_operations SET state='released' WHERE owner=? AND state='reserved' AND
    (id IN (SELECT id FROM ai_jobs WHERE owner=? AND state IN ('failed','cancelled')) OR created_at<?)`)
    .bind(owner,owner,Date.now()-7*86400000).run();
}
