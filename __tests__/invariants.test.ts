/**
 * Invariant tests — the whole input space, not hand-picked examples.
 *
 * The classifier's domain is tiny (2 × 2 × 3 = 12 combinations): there is no
 * excuse for sampling it. Exhaustive enumeration proves TOTALITY (never
 * throws), the burden-of-proof law (reasons ⟺ tier > 0), and the three
 * monotonicity laws that make the pyramid trustworthy: taking away
 * reversibility, adding visibility, or hardening the domain can NEVER
 * lower a tier. A classifier without monotonicity can be gamed by
 * re-describing an action — that is the reclassification cheat, made
 * structurally impossible.
 */
import { describe, expect, it } from 'vitest';
import { deriveTier, type TierInput } from '../src/tier';
import { TIER_MODE, type Domain } from '../src/types';

const DOMAINS: Domain[] = ['clear', 'complicated', 'complex'];
const BOOLS = [false, true];

/** Ordering of domains by hardness, for the monotonicity law. */
const HARDNESS: Record<Domain, number> = { clear: 0, complicated: 1, complex: 2 };

function allInputs(): TierInput[] {
  const out: TierInput[] = [];
  for (const reversible of BOOLS)
    for (const externallyVisible of BOOLS)
      for (const domain of DOMAINS) out.push({ reversible, externallyVisible, domain });
  return out;
}

describe('deriveTier — exhaustive over the full input space', () => {
  const inputs = allInputs();

  it('covers all 12 combinations', () => {
    expect(inputs).toHaveLength(12);
  });

  it('is total: every input yields a coherent verdict', () => {
    for (const input of inputs) {
      const v = deriveTier(input);
      expect(v.tier).toBeGreaterThanOrEqual(0);
      expect(v.tier).toBeLessThanOrEqual(5);
      expect(v.mode).toBe(TIER_MODE[v.tier]);
    }
  });

  it('burden of proof: reasons are non-empty exactly when tier > 0', () => {
    for (const input of inputs) {
      const v = deriveTier(input);
      if (v.tier > 0) expect(v.reasons.length, JSON.stringify(input)).toBeGreaterThan(0);
      else expect(v.reasons).toEqual([]);
    }
  });

  it('monotonicity: losing reversibility never lowers the tier', () => {
    for (const input of inputs.filter((i) => i.reversible)) {
      const rev = deriveTier(input).tier;
      const irrev = deriveTier({ ...input, reversible: false }).tier;
      expect(irrev, JSON.stringify(input)).toBeGreaterThanOrEqual(rev);
    }
  });

  it('monotonicity: becoming externally visible never lowers the tier', () => {
    for (const input of inputs.filter((i) => !i.externallyVisible)) {
      const internal = deriveTier(input).tier;
      const visible = deriveTier({ ...input, externallyVisible: true }).tier;
      expect(visible, JSON.stringify(input)).toBeGreaterThanOrEqual(internal);
    }
  });

  it('monotonicity: a harder domain never lowers the tier', () => {
    for (const input of inputs) {
      for (const harder of DOMAINS.filter((d) => HARDNESS[d] > HARDNESS[input.domain])) {
        const base = deriveTier(input).tier;
        const hardened = deriveTier({ ...input, domain: harder }).tier;
        expect(hardened, `${JSON.stringify(input)} -> ${harder}`).toBeGreaterThanOrEqual(base);
      }
    }
  });

  it('the pinned truth table, in one place', () => {
    // reversible, visible, domain -> tier. Change this table consciously or
    // not at all: every cell moves someone's day.
    const table: Array<[boolean, boolean, Domain, number]> = [
      [true, false, 'clear', 0],
      [true, false, 'complicated', 1],
      [true, false, 'complex', 4],
      [true, true, 'clear', 2],
      [true, true, 'complicated', 2],
      [true, true, 'complex', 4],
      [false, false, 'clear', 2],
      [false, false, 'complicated', 2],
      [false, false, 'complex', 4],
      [false, true, 'clear', 3],
      [false, true, 'complicated', 3],
      [false, true, 'complex', 4],
    ];
    for (const [reversible, externallyVisible, domain, tier] of table) {
      expect(
        deriveTier({ reversible, externallyVisible, domain }).tier,
        `reversible=${reversible} visible=${externallyVisible} domain=${domain}`,
      ).toBe(tier);
    }
  });
});
