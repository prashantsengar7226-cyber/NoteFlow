import { AsyncLocalStorage } from 'node:async_hooks';
import type { RouterCandidate } from './provider';

// Server-only request scope. Never change process.env for an individual user.
export const aiContext = new AsyncLocalStorage<{
  owner: string;
  candidate?: RouterCandidate;
  revision?: string;
  feature?: string;
  operationId?: string;
}>();
export const usesPersonalAI = (owner: string) => {
  const scope = aiContext.getStore();
  return scope?.owner === owner && !!scope.candidate;
};
