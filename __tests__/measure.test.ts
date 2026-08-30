import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JUDGE_OPTIONS,
  judge,
  reading,
  type MetricReading,
  type MetricSpec,
} from '../src/index';

const replyRate: MetricSpec = {
  id: 'reply_rate',
  definition: 'replies from them-side counterparts / threads nudged, 30d',
  unit: 'ratio',
  direction: 'up',
};

const disputeRate: MetricSpec = {
  id: 'dispute_rate',
  definition: 'disputes opened / captures, 90d',
  unit: 'ratio',
  direction: 'down',
};

const r = (spec: MetricSpec, value: number, n: number) => reading(spec, value, n);

describe('reading — the definition is pinned in', () => {
  it('carries the metric id, the verbatim definition, and n', () => {
    expect(r(replyRate, 0.11, 200)).toEqual({
      metricId: 'reply_rate',
      definition: replyRate.definition,
      value: 0.11,
      n: 200,
    });
  });
});

describe('judge — not_comparable: Goodhart enters through renamed denominators', () => {
  it('refuses readings taken under a different definition of the same metric', () => {
    const before: MetricReading = {
      metricId: 'reply_rate',
      definition: 'replies from ANY counterpart / threads nudged, 30d', // the 81%-vs-11% bug
      value: 0.81,
      n: 200,
    };
    const after = r(replyRate, 0.11, 200);
    const res = judge(replyRate, after, before);
    expect(res.verdict).toBe('not_comparable');
    expect(res.relDiff).toBeNull();
    expect(res.reason).toContain('changing what is counted');
  });

  it('refuses readings of a different metric altogether', () => {
    const res = judge(replyRate, r(disputeRate, 0.01, 100), r(replyRate, 0.1, 100));
    expect(res.verdict).toBe('not_comparable');
  });
});

describe('judge — too_early: a number without enough n is a vibe', () => {
  it('below minN on either side, the only verdict is too_early', () => {
    expect(judge(replyRate, r(replyRate, 0.5, 3), r(replyRate, 0.1, 100)).verdict).toBe('too_early');
    expect(judge(replyRate, r(replyRate, 0.5, 100), r(replyRate, 0.1, 3)).verdict).toBe('too_early');
  });

  it('the reason names the offending n and the bar', () => {
    const res = judge(replyRate, r(replyRate, 0.5, 3), r(replyRate, 0.1, 100));
    expect(res.reason).toContain('n=3');
    expect(res.reason).toContain('20');
  });

  it('minN is an option, not a constant', () => {
    const res = judge(replyRate, r(replyRate, 0.5, 3), r(replyRate, 0.1, 5), {
      minN: 3,
      minRelDiff: 0.1,
    });
    expect(res.verdict).not.toBe('too_early');
  });
});

describe('judge — effect and direction', () => {
  it('an up-metric that rose enough: improved, with the signed relDiff', () => {
    const res = judge(replyRate, r(replyRate, 0.15, 100), r(replyRate, 0.1, 100));
    expect(res.verdict).toBe('improved');
    expect(res.relDiff).toBeCloseTo(0.5);
    expect(res.reason).toContain('50%');
  });

  it('an up-metric that fell: regressed — direction comes from the spec, not the sign', () => {
    const res = judge(replyRate, r(replyRate, 0.05, 100), r(replyRate, 0.1, 100));
    expect(res.verdict).toBe('regressed');
    expect(res.relDiff).toBeCloseTo(-0.5);
  });

  it('a down-metric that fell: improved (fewer disputes is the win)', () => {
    const res = judge(disputeRate, r(disputeRate, 0.01, 100), r(disputeRate, 0.02, 100));
    expect(res.verdict).toBe('improved');
  });

  it('a down-metric that rose: regressed', () => {
    const res = judge(disputeRate, r(disputeRate, 0.03, 100), r(disputeRate, 0.02, 100));
    expect(res.verdict).toBe('regressed');
  });

  it('a difference under minRelDiff is no_effect, not a small win', () => {
    const res = judge(replyRate, r(replyRate, 0.105, 100), r(replyRate, 0.1, 100));
    expect(res.verdict).toBe('no_effect');
    expect(res.reason).toContain('10%');
  });
});

describe('judge — zero baseline (division is not an excuse)', () => {
  it('0 → 0 is no_effect', () => {
    const res = judge(replyRate, r(replyRate, 0, 100), r(replyRate, 0, 100));
    expect(res.verdict).toBe('no_effect');
    expect(res.relDiff).toBeNull();
  });

  it('0 → something is a verdict with relDiff null, not Infinity', () => {
    const res = judge(replyRate, r(replyRate, 0.2, 100), r(replyRate, 0, 100));
    expect(res.verdict).toBe('improved');
    expect(res.relDiff).toBeNull();
    expect(res.reason).toContain('baseline was 0');
  });
});

describe('defaults', () => {
  it('ship with an honest bar: n≥20, ≥10% difference', () => {
    expect(DEFAULT_JUDGE_OPTIONS).toEqual({ minN: 20, minRelDiff: 0.1 });
  });
});
