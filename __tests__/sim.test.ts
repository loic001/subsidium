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
  averageSop,
  convergentWorld,
  defaultSopWorld,
  defaultWorld,
  lcg,
  simulateGating,
  simulateOutreach,
  simulateSopGating,
  type GatingConfig,
  type GatingResult,
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

describe('convergence — the self-learning loop, priced', () => {
  // The claim behind "auto-apprenant et qui converge": as kinds earn trust,
  // consent becomes veto becomes auto and the human's WEEK shrinks — toward
  // the irreducible complex core, never to zero. Preconditions are part of
  // the doctrine: a trustworthy world AND a consistent reviewer AND the
  // weekly autonomy review that re-arms cliffed kinds whose record deserves
  // it. Remove any of the three and the curve refuses to converge — pinned
  // below, each one.
  const cw = convergentWorld();
  const pyr = averageGating('pyramid', cw, SEEDS);
  const gov = averageGating('pyramid_governor', cw, SEEDS);
  const noReview = averageGating('pyramid_governor', { ...cw, review: undefined }, SEEDS);
  const last3 = (r: GatingResult): number =>
    r.weeklyHumanMinutes.slice(-3).reduce((a, b) => a + b, 0) / 3;

  it('the human week SHRINKS: the last three weeks cost ≤ 70% of week one', () => {
    expect(last3(gov)).toBeLessThanOrEqual(gov.weeklyHumanMinutes[0] * 0.7);
  });

  it('…and EVERY single week costs less than the static pyramid — convergence is not a spike', () => {
    gov.weeklyHumanMinutes.forEach((m, w) => {
      expect(m).toBeLessThan(pyr.weeklyHumanMinutes[w]);
    });
  });

  it('the totals: attention halves, throughput per human-hour doubles, safety holds', () => {
    expect(gov.humanMinutes).toBeLessThanOrEqual(pyr.humanMinutes * 0.55);
    expect(gov.unblockedPerHour).toBeGreaterThanOrEqual(pyr.unblockedPerHour * 2);
    expect(gov.unblocked).toBeGreaterThanOrEqual(pyr.unblocked);
    expect(gov.incidents).toBeLessThanOrEqual(pyr.incidents + 0.5);
  });

  it('WITHOUT the autonomy review the cliff freezes trust — convergence is not durable', () => {
    // One caught bad fire on a 99%-good kind demotes it stickily; nobody
    // re-arms it; the curve climbs back and stays. The review is the loop.
    expect(last3(noReview)).toBeGreaterThanOrEqual(last3(gov) * 1.2);
  });

  it('a review that never fits the daily budget never happens — identical to no review', () => {
    const starved = averageGating(
      'pyramid_governor',
      { ...cw, review: { everyDays: 7, minutesPerItem: cw.human.minutesPerDay + 1 } },
      SEEDS,
    );
    expect(starved.weeklyHumanMinutes).toEqual(noReview.weeklyHumanMinutes);
  });

  it('the review REFUSES a rotten kind: no unearned re-arming, ever', () => {
    // The trustworthy kind turns rotten at day 28. The cliff demotes it, the
    // review reads its record, and keeps refusing: the curve climbs back to
    // the static level (the human is back in the loop) with FEWER incidents.
    const rotten = { ...cw, drift: { day: 28, kind: 'routine_status_email', goodRate: 0.3 } };
    const govRotten = averageGating('pyramid_governor', rotten, SEEDS);
    const pyrRotten = averageGating('pyramid', rotten, SEEDS);
    expect(last3(govRotten)).toBeGreaterThanOrEqual(last3(pyrRotten) * 0.95);
    expect(govRotten.incidents).toBeLessThanOrEqual(pyrRotten.incidents);
  });

  it('no unearned convergence: in the messy default world the curve stays flat', () => {
    // defaultWorld's consent kinds run 80-85% good — trust is never granted,
    // and the honest curve says so. (Full weeks only: 60 days leaves a
    // 4-day tail bucket.)
    const messy = averageGating('pyramid_governor', world, SEEDS);
    const weeks = messy.weeklyHumanMinutes;
    expect(weeks[7]).toBeGreaterThanOrEqual(weeks[0] * 0.95);
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

describe('the weakest-link law, priced — SOP chains', () => {
  const sopWorld = defaultSopWorld();

  it('is exactly reproducible', () => {
    const a = simulateSopGating('average_tier', { ...sopWorld, seed: 42 });
    expect(a).toEqual(simulateSopGating('average_tier', { ...sopWorld, seed: 42 }));
  });

  it('STRUCTURAL: under weakest_link, a dangerous chain NEVER fires on auto — any seed', () => {
    for (const seed of [...SEEDS, 7, 77, 777]) {
      const r = simulateSopGating('weakest_link', { ...sopWorld, seed });
      expect(r.dangerousAutoFired, `seed ${seed}`).toBe(0);
    }
  });

  it('average_tier is the whole pathology: T0+T1+T3 averages to "auto" and the merchant email fires unseen', () => {
    const avg = averageSop('average_tier', sopWorld, SEEDS);
    const weak = averageSop('weakest_link', sopWorld, SEEDS);
    // activate_merchant alone is 4/day × 60 days routed straight to auto.
    expect(avg.dangerousAutoFired).toBeGreaterThan(200);
    expect(avg.incidents).toBeGreaterThan(weak.incidents * 3);
  });

  it('the tradeoff is stated honestly: averaging LOOKS faster — that is exactly the trap', () => {
    const avg = averageSop('average_tier', sopWorld, SEEDS);
    const weak = averageSop('weakest_link', sopWorld, SEEDS);
    // More runs fired, fewer human minutes: every metric a dashboard loves…
    expect(avg.runsFired).toBeGreaterThanOrEqual(weak.runsFired);
    expect(avg.humanMinutes).toBeLessThanOrEqual(weak.humanMinutes);
    // …and the incidents above are what those metrics do not show.
  });

  it('when max == average (close_dead_file: T1+T2), both policies route identically', () => {
    const oneSop = { ...sopWorld, sops: sopWorld.sops.filter((s) => s.kind === 'close_dead_file') };
    const a = simulateSopGating('average_tier', { ...oneSop, seed: 42 });
    const w = simulateSopGating('weakest_link', { ...oneSop, seed: 42 });
    expect(a).toEqual({ ...w, policy: 'average_tier' });
  });
});

describe('robustness — the orderings are not a lucky constant', () => {
  // The README quotes one world (60 min/day, accuracy 0.9). This grid varies
  // the founder's budget ×0.5/×2 and the human's accuracy 0.8→0.97 and pins
  // the two claims that pay for the framework in EVERY cell:
  //   1. pyramid throughput per attention-hour beats all_consent;
  //   2. pyramid incidents stay far below all_auto.
  const budgets = [30, 60, 120];
  const accuracies = [0.8, 0.9, 0.97];

  it('throughput/hour and incident orderings hold across the whole grid', () => {
    for (const minutesPerDay of budgets) {
      for (const accuracy of accuracies) {
        const cell = { ...world, human: { ...world.human, minutesPerDay, accuracy } };
        const pyr = averageGating('pyramid', cell, SEEDS);
        const consent = averageGating('all_consent', cell, SEEDS);
        const auto = averageGating('all_auto', cell, SEEDS);
        const label = `${minutesPerDay} min/day · accuracy ${accuracy}`;
        expect(pyr.unblockedPerHour, label).toBeGreaterThan(consent.unblockedPerHour);
        expect(pyr.incidents, label).toBeLessThan(auto.incidents / 4);
      }
    }
  });

  it('the governor beats static at a reasonable track bar — and at a very high bar it costs at most noise', () => {
    // Measured, not assumed: at minTrack 40 on a 60-day horizon the
    // promotion lands too late to pay for itself (146.6 vs 147.6 unblocked,
    // −0.7%). The honest claim is "wins when trust can actually be earned
    // within the horizon, never loses more than noise when it cannot" —
    // pinned exactly like that, so nobody oversells the governor either.
    const stat = averageGating('pyramid', world, SEEDS);
    for (const minTrack of [10, 20]) {
      const cfg = { ...world, governor: { minTrack, errorBudget: 0.25 } };
      const gov = averageGating('pyramid_governor', cfg, SEEDS);
      expect(gov.unblocked, `minTrack ${minTrack}`).toBeGreaterThanOrEqual(stat.unblocked);
    }
    const late = averageGating('pyramid_governor', { ...world, governor: { minTrack: 40, errorBudget: 0.25 } }, SEEDS);
    expect(late.unblocked).toBeGreaterThanOrEqual(stat.unblocked * 0.98);
  });
});
