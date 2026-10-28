import { env } from './platform';
import { activeAccess, elevated } from './access';

/** Server-owned rollout policy. Never accept role or trial flags from clients. */
export async function summaryTrialEnabled(owner: string) {
  const settings=env as unknown as Record<string,string|undefined>;
  if(settings.SUMMARY_PIPELINE_TRIAL==='off')return false;
  if(settings.SUMMARY_PIPELINE_TRIAL==='admins')return elevated((await activeAccess(owner)).role);
  return !settings.VERCEL && settings.SUMMARY_LARGE_BATCHES==='true';
}
