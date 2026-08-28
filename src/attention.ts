/**
 * subsidium · attention ledger
 *
 * A human tier bills minutes of a person's day, and the budget regenerates
 * daily. This is the one thing an LLM cascade does not model: a model tier
 * can absorb 500 escalations; a founder cannot. When the budget is spent,
 * escalations QUEUE — they never spill onto the human anyway, because an
 * ignored queue is honest and an overflowing inbox teaches the human to
 * ignore ALL of it (alert fatigue is how pages die).
 */
import type { AttentionBudget } from './types';

export interface AttentionState {
  /** Minutes spent against today's budget. */
  spentToday: number;
  /** Items waiting because the budget ran out. */
  queued: number;
}

export const EMPTY_ATTENTION: AttentionState = { spentToday: 0, queued: 0 };

export type AttentionDecision = { admit: true; state: AttentionState } | { admit: false; state: AttentionState };

/** Try to put one item in front of the human today. */
export function admit(budget: AttentionBudget, state: AttentionState): AttentionDecision {
  const after = state.spentToday + budget.minutesPerItem;
  if (after <= budget.minutesPerDay) {
    return { admit: true, state: { ...state, spentToday: after } };
  }
  return { admit: false, state: { ...state, queued: state.queued + 1 } };
}

/** New day: budget regenerates, the queue drains first, oldest first. */
export function rollover(budget: AttentionBudget, state: AttentionState): AttentionState & { drained: number } {
  const capacity = Math.floor(budget.minutesPerDay / budget.minutesPerItem);
  const drained = Math.min(state.queued, capacity);
  return {
    spentToday: drained * budget.minutesPerItem,
    queued: state.queued - drained,
    drained,
  };
}
