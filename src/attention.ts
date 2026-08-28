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

/**
 * A budget that can never admit a single item is not a tight budget — it is
 * a silent infinite queue: admit() would refuse forever and rollover() would
 * drain zero, while the caller believes items are merely "waiting". That is
 * a turkey (100% apparent handling, 0% real), so it throws at first use.
 */
function assertViable(budget: AttentionBudget): void {
  if (budget.minutesPerItem <= 0 || budget.minutesPerDay <= 0) {
    throw new Error(`attention budget must be positive (got ${budget.minutesPerDay}/day, ${budget.minutesPerItem}/item)`);
  }
  if (budget.minutesPerItem > budget.minutesPerDay) {
    throw new Error(
      `attention budget can never admit a single item (${budget.minutesPerItem} min/item > ${budget.minutesPerDay} min/day): this is a silent infinite queue, not a tight budget`,
    );
  }
}

/** Try to put one item in front of the human today. */
export function admit(budget: AttentionBudget, state: AttentionState): AttentionDecision {
  assertViable(budget);
  const after = state.spentToday + budget.minutesPerItem;
  if (after <= budget.minutesPerDay) {
    return { admit: true, state: { ...state, spentToday: after } };
  }
  return { admit: false, state: { ...state, queued: state.queued + 1 } };
}

/** New day: budget regenerates, the queue drains first, oldest first. */
export function rollover(budget: AttentionBudget, state: AttentionState): AttentionState & { drained: number } {
  assertViable(budget);
  const capacity = Math.floor(budget.minutesPerDay / budget.minutesPerItem);
  const drained = Math.min(state.queued, capacity);
  return {
    spentToday: drained * budget.minutesPerItem,
    queued: state.queued - drained,
    drained,
  };
}
