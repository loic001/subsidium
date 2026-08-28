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

  it('an empty queue rolls over to a clean day', () => {
    const next = rollover(budget, { spentToday: 30, queued: 0 });
    expect(next).toEqual({ spentToday: 0, queued: 0, drained: 0 });
  });

  it('a short queue leaves budget for the day', () => {
    const next = rollover(budget, { spentToday: 30, queued: 1 });
    expect(next.drained).toBe(1);
    expect(next.spentToday).toBe(10);
    // Two more items fit today.
    const d = admit(budget, next);
    expect(d.admit).toBe(true);
  });
});

describe('pathological budgets explode instead of queueing forever', () => {
  // A budget that can never admit one item would make admit() refuse forever
  // and rollover() drain zero — a silent infinite queue wearing the costume
  // of a tight budget. That is a turkey; it must throw at first use.
  it('minutesPerItem > minutesPerDay is a misconfiguration, not a budget', () => {
    const bad = { minutesPerDay: 5, minutesPerItem: 10 };
    expect(() => admit(bad, EMPTY_ATTENTION)).toThrow(/never admit a single item/);
    expect(() => rollover(bad, EMPTY_ATTENTION)).toThrow(/never admit a single item/);
  });

  it('zero or negative budgets throw too', () => {
    expect(() => admit({ minutesPerDay: 0, minutesPerItem: 10 }, EMPTY_ATTENTION)).toThrow(/positive/);
    expect(() => admit({ minutesPerDay: 30, minutesPerItem: 0 }, EMPTY_ATTENTION)).toThrow(/positive/);
    expect(() => rollover({ minutesPerDay: 30, minutesPerItem: -1 }, EMPTY_ATTENTION)).toThrow(/positive/);
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

  it('a short history passes through untouched — compression is a cap, not a tax', () => {
    const sig = buildEscalationSignal('sub_1', 'stuck KYC', [
      { what: 'dashboard message', outcome: 'no reply' },
      { what: 'email', outcome: 'bounced' },
    ]);
    expect(sig.failureSummary).toBe('email -> bounced · dashboard message -> no reply');
    expect(sig.attempts).toBe(2);
  });

  it('zero attempts is a valid signal: « we never even got to try »', () => {
    const sig = buildEscalationSignal('sub_1', 'blocked upstream', []);
    expect(sig.attempts).toBe(0);
    expect(sig.failureSummary).toBe('');
  });
});
