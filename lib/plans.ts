import { MAX_TEXT } from './core';
// Server-owned policy. Existing tools stay available during the free launch.
export const FEATURE_LIST = [
  'YouTube and PDF summaries',
  'Multi-PDF summary downloads',
  'Source-based chat',
  'Flashcards and quizzes',
  'Mind maps and slides',
  'Translation and source insights',
  'Private notes and collections',
  'PDF, Markdown and Anki exports',
] as const;
export const FREE_PLAN = {
  id: 'free',
  name: 'Free',
  daily: { ai: 20, youtube: 3, audio: 0 },
  limits: { characters: MAX_TEXT, batch: 5, uploadMB: 20, notes: 1000 },
} as const;
export function effectivePlan(verifiedPurchase = false, commercial = false) {
  return {
    ...FREE_PLAN,
    id: verifiedPurchase ? 'pro_once' : 'free',
    name: verifiedPurchase ? 'Pro' : 'Free',
    access: verifiedPurchase || !commercial ? 'full' : 'basic',
    daily: verifiedPurchase || !commercial ? FREE_PLAN.daily : { ai: 0, youtube: 0, audio: 0 },
  };
}
export function nextReset() {
  return (Math.floor(Date.now() / 86400000) + 1) * 86400000;
}
