import {env} from './platform';
import type {RouterCandidate} from './provider';

/** A dedicated key prevents silently reusing the billing-enabled Vertex project.
 * The operator must verify the project's Free tier in AI Studio before enabling. */
export function freeGeminiCandidate(): RouterCandidate | undefined {
  const v=env as unknown as Record<string,string|undefined>;
  const key=v.GEMINI_FREE_API_KEY?.trim();
  const model=v.GEMINI_FREE_MODEL?.trim() || 'gemini-3.6-flash';
  if(!key || v.GEMINI_FREE_TIER_CONFIRMED!=='true' || !/^gemini-[a-zA-Z0-9.-]+$/.test(model)) return;
  return {provider:'gemini',key,model}; // Exactly one model. No fallback to another provider or Vertex.
}
