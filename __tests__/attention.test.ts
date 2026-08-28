/**
 * Attention ledger: when the budget is spent, escalations queue — they
 * never spill. An overflowing inbox teaches the human to ignore all of it.
 */
import { describe, expect, it } from 'vitest';
import { admit, EMPTY_ATTENTION, rollover } from '../src/attention';
import { buildEscalationSignal, MAX_SUMMARY_LENGTH } from '../src/escalation';

const budget = { minutesPerDay: 30, minutesPerItem: 10 };

describe('admit', () => {
  it('admits until the daily budget is spent, then queues', () => {
    let state = EMPTY_ATTENTION;
    for (let i = 0; i < 3; i++) {
      const d = admit(budget, state);
      expect(d.admit).toBe(true);
      state = d.state;
    }
    const fourth = admit(budget, state);
    expect(fourth.admit).toBe(false);
    expect(fourth.state.queued).toBe(1);
  });
});

describe('rollover', () => {
  it('a new day drains the queue first, within the new budget', () => {
    const state = { spentToday: 30, queued: 5 };
    const next = rollover(budget, state);
    expect(next.drained).toBe(3);
    expect(next.queued).toBe(2);
    expect(next.spentToday).toBe(30);
  });
});

describe('escalation signal — errors ascend compressed', () => {
  it('summarizes newest-first and enforces the hard cap', () => {
    const attempts = Array.from({ length: 40 }, (_, i) => ({
      what: `attempt ${i}`,
      outcome: 'no reply after several days of waiting',
    }));
    const sig = buildEscalationSignal('sub_1', 'stuck KYC', attempts);
    expect(sig.attempts).toBe(40);
    expect(sig.failureSummary.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
    // Newest first: attempt 39 must survive the truncation, attempt 0 must not.
    expect(sig.failureSummary).toContain('attempt 39');
    expect(sig.failureSummary).not.toContain('attempt 0 ');
  });
});
