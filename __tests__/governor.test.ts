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
