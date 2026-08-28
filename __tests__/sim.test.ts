/**
 * The closed world — every promise of the framework becomes an assertion.
 *
 * These are OUTCOME tests, not mechanics tests: they run the real primitives
 * inside a seeded world with known ground truth and check the ORDERINGS the
 * framework claims. Deterministic (LCG, fixed seeds): a failure here is a
 * real regression, never flake.
 *
 * What this file proves — and what it does not: the laws produce the
 * promised orderings UNDER THE STATED ASSUMPTIONS. Production keeps the
 * final word on the assumptions.
 */
import { describe, expect, it } from 'vitest';
import {
  averageGating,
  defaultWorld,
  lcg,
  simulateGating,
  simulateOutreach,
  type GatingConfig,
  type OutreachConfig,
} from '../src/sim';

const SEEDS = [11, 42, 137, 1001, 9090];
const world = defaultWorld();

const OUTREACH: OutreachConfig = {
  seed: 42,
  counterparts: 500,
  channels: 3,
  bestChannelRate: 0.5,
  otherChannelRate: 0.05,
  annoyanceThreshold: 1,
  naiveCap: 6,
};

describe('determinism — same seed, same world, same numbers', () => {
  it('gating is exactly reproducible', () => {
    const a = simulateGating('pyramid', { ...world, seed: 42 });
    const b = simulateGating('pyramid', { ...world, seed: 42 });
    expect(a).toEqual(b);
  });

  it('outreach is exactly reproducible', () => {
    expect(simulateOutreach('law', OUTREACH)).toEqual(simulateOutreach('law', OUTREACH));
  });

  it('the rng is a plain LCG with a non-zero seed guard', () => {
    const r = lcg(0); // 0 would freeze a naive LCG — the guard replaces it
    const seq = [r.next(), r.next(), r.next()];
    expect(new Set(seq).size).toBe(3);
    for (const v of seq) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('the turkey: all_auto', () => {
  it('fires everything instantly — and produces an order of magnitude more incidents', () => {
    const auto = averageGating('all_auto', world, SEEDS);
    const pyr = averageGating('pyramid', world, SEEDS);
    expect(auto.humanMinutes).toBe(0);
    expect(auto.queuedEnd).toBe(0);
    expect(auto.avgWaitDays).toBe(0);
    // The whole point of gates: bad, irreversible, visible actions escape.
    expect(auto.incidents).toBeGreaterThan(pyr.incidents * 5);
  });
});

describe('the bottleneck: all_consent', () => {
  it('is safe but starves — the queue grows without bound', () => {
    const consent = averageGating('all_consent', world, SEEDS);
    const pyr = averageGating('pyramid', world, SEEDS);
    // Demand is 20 items/day at ~5 min each against a 60-minute day:
    // the backlog at the horizon is the honest signature of the bottleneck.
    expect(consent.queuedEnd).toBeGreaterThan(200);
    expect(consent.queuedEnd).toBeGreaterThan(pyr.queuedEnd * 3);
    expect(consent.avgWaitDays).toBeGreaterThan(pyr.avgWaitDays);
  });
});

describe('the claim that pays for everything: the pyramid', () => {
  const consent = averageGating('all_consent', world, SEEDS);
  const pyr = averageGating('pyramid', world, SEEDS);
  const auto = averageGating('all_auto', world, SEEDS);

  it('unblocks more subjects than all_consent…', () => {
    expect(pyr.unblocked).toBeGreaterThan(consent.unblocked);
  });

  it('…while spending FEWER human minutes…', () => {
    expect(pyr.humanMinutes).toBeLessThan(consent.humanMinutes);
  });

  it('…which multiplies throughput per attention-hour', () => {
    expect(pyr.unblockedPerHour).toBeGreaterThan(consent.unblockedPerHour * 1.5);
  });

  it('…without approaching all_auto damage', () => {
    expect(pyr.incidents).toBeLessThan(auto.incidents / 5);
  });

  it('what it does NOT claim: zero incidents — the human is not an oracle either', () => {
    // accuracy 0.9 lets some bad consents through; the pyramid is honest
    // about being a triage, not a shield. Locked so nobody oversells it.
    expect(pyr.incidents).toBeGreaterThan(0);
  });
});

describe('the governor under drift — the regime-change test', () => {
  // merchant_message (derived T3, promotable to the veto lane) turns rotten
  // at day 30: from 80% good to 15%. The ablation isolates exactly what the
  // CLIFF is worth: same promotions, contest disabled.
  const drifted: Omit<GatingConfig, 'seed'> = {
    ...world,
    drift: { day: 30, kind: 'merchant_message', goodRate: 0.15 },
    governor: { minTrack: 15, errorBudget: 0.25 },
  };

  it('the cliff bounds the damage: with contests vs promotion-without-demotion', () => {
    const withCliff = averageGating('pyramid_governor', drifted, SEEDS);
    const noCliff = averageGating(
      'pyramid_governor',
      { ...drifted, human: { ...drifted.human, contestRate: 0 } },
      SEEDS,
    );
    // Without the cliff, the rotten kind keeps its earned promotion and
    // bleeds through the veto lane until the horizon.
    expect(withCliff.incidents).toBeLessThan(noCliff.incidents);
    expect(withCliff.badFired).toBeLessThan(noCliff.badFired);
  });

  it('what the promotion is worth BEFORE any drift: more throughput, fewer human minutes', () => {
    const withGov = averageGating('pyramid_governor', { ...world, governor: { minTrack: 15, errorBudget: 0.25 } }, SEEDS);
    const withoutGov = averageGating('pyramid', world, SEEDS);
    expect(withGov.unblocked).toBeGreaterThanOrEqual(withoutGov.unblocked);
    expect(withGov.humanMinutes).toBeLessThanOrEqual(withoutGov.humanMinutes);
  });

  it('the cliff pays for the promotion — measured, and it surprised us', () => {
    // Expected going in: promotion bleeds a little vs the never-promoting
    // static pyramid, the cliff merely bounds it. Measured (5 seeds): the
    // governor with the cliff lands AT OR BELOW the static pyramid's damage
    // (~34 vs ~36 bad fires), because vetoes and rejections also feed the
    // failure record and pull the rotten kind back early. Without the cliff,
    // damage nearly doubles (~65). The robust claim, pinned here:
    //   governor-with-cliff ≤ static × 1.1  ≪  governor-without-cliff.
    const stat = averageGating('pyramid', drifted, SEEDS);
    const withCliff = averageGating('pyramid_governor', drifted, SEEDS);
    const noCliff = averageGating(
      'pyramid_governor',
      { ...drifted, human: { ...drifted.human, contestRate: 0 } },
      SEEDS,
    );
    expect(withCliff.badFired).toBeLessThanOrEqual(stat.badFired * 1.1);
    expect(noCliff.badFired).toBeGreaterThan(withCliff.badFired * 1.5);
  });
});

describe('outreach — the thread law against the hammer', () => {
  const naive = simulateOutreach('naive', OUTREACH);
  const law = simulateOutreach('law', OUTREACH);

  it('the law gets MORE replies…', () => {
    expect(law.replies).toBeGreaterThan(naive.replies);
  });

  it('…with FEWER messages…', () => {
    expect(law.messagesSent).toBeLessThan(naive.messagesSent);
  });

  it('…and structurally ZERO social damage, where the hammer burns people', () => {
    expect(law.annoyanceEvents).toBe(0);
    expect(naive.annoyanceEvents).toBeGreaterThan(0);
  });

  it('the law exits honestly: unanswered threads are CLOSED, not immortal', () => {
    expect(law.closed).toBe(OUTREACH.counterparts - law.replies);
  });
});

describe('degenerate worlds — zeros, not NaN', () => {
  it('an empty world produces zeros everywhere', () => {
    const r = simulateGating('pyramid', { ...world, kinds: [], seed: 42 });
    expect(r.fired).toBe(0);
    expect(r.avgWaitDays).toBe(0);
    expect(r.unblockedPerHour).toBe(Number.POSITIVE_INFINITY); // no minutes spent
    expect(r.queuedEnd).toBe(0);
  });
});

describe('conservation laws — nothing is created or lost', () => {
  it('every arrival is fired, stopped, or still queued', () => {
    for (const policy of ['all_auto', 'all_consent', 'pyramid', 'pyramid_governor'] as const) {
      const r = simulateGating(policy, { ...world, seed: 42 });
      const arrivals = world.days * world.kinds.reduce((s, k) => s + k.perDay, 0);
      expect(r.fired + r.stopped + r.queuedEnd, policy).toBe(arrivals);
    }
  });

  it('every outreach counterpart ends replied or closed (law) — none dangle', () => {
    const law = simulateOutreach('law', OUTREACH);
    expect(law.replies + law.closed).toBe(OUTREACH.counterparts);
  });
});
