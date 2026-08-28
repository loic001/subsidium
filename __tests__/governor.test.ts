/**
 * The governor: promotion is slow and earned, demotion is an instant cliff.
 */
import { describe, expect, it } from 'vitest';
import { TierGovernor } from '../src/governor';

const opts = { minTrack: 10, errorBudget: 0.1 };

describe('promotion is earned by measurement', () => {
  it('no track record, no promotion — Deep Insights before Auto Pilot', () => {
    const g = new TierGovernor(opts);
    expect(g.effectiveTier('send_reminder', 3)).toBe(3);
  });

  it('a clean track record earns exactly ONE tier, never more', () => {
    const g = new TierGovernor(opts);
    for (let i = 0; i < 10; i++) g.record('send_reminder', 'success');
    expect(g.effectiveTier('send_reminder', 3)).toBe(2);
    // T3 -> T0 in one move is how turkeys are farmed.
    expect(g.effectiveTier('send_reminder', 3)).not.toBe(0);
  });

  it('a failure rate over the error budget blocks promotion', () => {
    const g = new TierGovernor(opts);
    for (let i = 0; i < 9; i++) g.record('flaky_action', 'success');
    for (let i = 0; i < 2; i++) g.record('flaky_action', 'failure');
    expect(g.effectiveTier('flaky_action', 3)).toBe(3);
  });

  it('T0 cannot be promoted below itself', () => {
    const g = new TierGovernor(opts);
    for (let i = 0; i < 10; i++) g.record('recompute', 'success');
    expect(g.effectiveTier('recompute', 0)).toBe(0);
  });
});

describe('demotion is an instant, sticky cliff', () => {
  it('one human contest snaps the kind back to its derived tier', () => {
    const g = new TierGovernor(opts);
    for (let i = 0; i < 10; i++) g.record('send_reminder', 'success');
    expect(g.effectiveTier('send_reminder', 3)).toBe(2);

    g.contestUp('send_reminder'); // "this needed me"
    expect(g.effectiveTier('send_reminder', 3)).toBe(3);

    // More successes do NOT quietly re-promote: the fold from clear to
    // chaotic is not repaired by the passage of time.
    for (let i = 0; i < 20; i++) g.record('send_reminder', 'success');
    expect(g.effectiveTier('send_reminder', 3)).toBe(3);
  });

  it('only a deliberate reset re-opens the path, and the record restarts', () => {
    const g = new TierGovernor(opts);
    for (let i = 0; i < 10; i++) g.record('send_reminder', 'success');
    g.contestUp('send_reminder');
    g.reset('send_reminder');
    // Track record was wiped: trust is re-earned from zero.
    expect(g.effectiveTier('send_reminder', 3)).toBe(3);
    for (let i = 0; i < 10; i++) g.record('send_reminder', 'success');
    expect(g.effectiveTier('send_reminder', 3)).toBe(2);
  });
});

describe('bords et hygiène', () => {
  it('exactly ON the error budget still promotes — the budget is a budget, not a taboo', () => {
    const g = new TierGovernor({ minTrack: 10, errorBudget: 0.1 });
    for (let i = 0; i < 9; i++) g.record('kind', 'success');
    g.record('kind', 'failure'); // 1/10 = exactly 0.1
    expect(g.effectiveTier('kind', 3)).toBe(2);
  });

  it('a contest on an unknown kind still demotes future runs — fail-closed', () => {
    const g = new TierGovernor(opts);
    g.contestUp('jamais_vu');
    for (let i = 0; i < 20; i++) g.record('jamais_vu', 'success');
    expect(g.effectiveTier('jamais_vu', 3)).toBe(3);
  });

  it('reset on a kind never seen is a no-op, not a crash', () => {
    const g = new TierGovernor(opts);
    expect(() => g.reset('jamais_vu')).not.toThrow();
    expect(g.effectiveTier('jamais_vu', 3)).toBe(3);
  });

  it('snapshot returns a copy — mutating it changes nothing', () => {
    const g = new TierGovernor(opts);
    g.record('kind', 'success');
    const snap = g.snapshot('kind') as { executions: number };
    snap.executions = 999;
    expect(g.snapshot('kind').executions).toBe(1);
  });

  it('snapshot of an unknown kind is the empty record', () => {
    const g = new TierGovernor(opts);
    expect(g.snapshot('jamais_vu')).toEqual({
      executions: 0,
      failures: 0,
      contestsUp: 0,
      contestsDown: 0,
      demotedUntilReset: false,
    });
  });

  it('invariant under random event sequences: the tier is always derived or derived-1', () => {
    // Mini-simulation déterministe (seed maison) — le harnais de panarchy-llm
    // en plus petit : on prouve l'invariant sous séquences arbitraires.
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const g = new TierGovernor(opts);
    for (let i = 0; i < 500; i++) {
      const r = rand();
      if (r < 0.6) g.record('k', rand() < 0.9 ? 'success' : 'failure');
      else if (r < 0.7) g.contestUp('k');
      else if (r < 0.8) g.contestDown('k');
      else if (r < 0.85) g.reset('k');
      for (const derived of [0, 1, 2, 3, 4, 5] as const) {
        const eff = g.effectiveTier('k', derived);
        expect(eff === derived || eff === derived - 1).toBe(true);
        expect(eff).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('the yellow card', () => {
  it('contesting DOWN never changes the tier by itself — it is evidence, not a lever', () => {
    const g = new TierGovernor(opts);
    for (let i = 0; i < 5; i++) g.contestDown('send_reminder');
    // Still no executions: the yellow card informs the review, the track
    // record decides. You do not improve a metric by reclassifying.
    expect(g.effectiveTier('send_reminder', 3)).toBe(3);
    expect(g.snapshot('send_reminder').contestsDown).toBe(5);
  });
});
