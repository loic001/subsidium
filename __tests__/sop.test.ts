import { describe, expect, it } from 'vitest';
import {
  deriveSopTier,
  deriveTier,
  SOP_STATUSES,
  sopGovernorKey,
  sopRunnable,
  sopTransition,
  type SopEvent,
  type SopStatus,
  type SopStep,
} from '../src/index';
import type { Domain, TierInput } from '../src/index';

const step = (actionKind: string, input: TierInput): SopStep => ({
  actionKind,
  title: actionKind,
  input,
});

const T0: TierInput = { reversible: true, externallyVisible: false, domain: 'clear' };
const T2: TierInput = { reversible: false, externallyVisible: false, domain: 'clear' };
const T3: TierInput = { reversible: false, externallyVisible: true, domain: 'complicated' };

/** Every possible step input: 2 × 2 × 3 = 12 cells, same space as the classifier table test. */
const ALL_INPUTS: TierInput[] = (['clear', 'complicated', 'complex'] as Domain[]).flatMap(
  (domain) =>
    [true, false].flatMap((reversible) =>
      [true, false].map((externallyVisible) => ({ reversible, externallyVisible, domain })),
    ),
);

describe('deriveSopTier — the weakest-link law', () => {
  it('refuses an empty procedure', () => {
    expect(() => deriveSopTier([])).toThrow(/no steps/);
  });

  it('a single-step SOP has exactly that step’s tier', () => {
    for (const input of ALL_INPUTS) {
      expect(deriveSopTier([step('only', input)]).tier).toBe(deriveTier(input).tier);
    }
  });

  it('over the whole input space, the SOP tier is the MAX of its steps — never an average', () => {
    for (const a of ALL_INPUTS) {
      for (const b of ALL_INPUTS) {
        const expected = Math.max(deriveTier(a).tier, deriveTier(b).tier);
        expect(deriveSopTier([step('a', a), step('b', b)]).tier).toBe(expected);
      }
    }
  });

  it('adding a step can never LOWER the tier (monotonicity)', () => {
    for (const extra of ALL_INPUTS) {
      const base = deriveSopTier([step('mail', T3)]);
      const longer = deriveSopTier([step('mail', T3), step('extra', extra)]);
      expect(longer.tier).toBeGreaterThanOrEqual(base.tier);
    }
  });

  it('the reasons name the step that forced the tier', () => {
    const v = deriveSopTier([step('tag_account', T0), step('email_merchant', T3)]);
    expect(v.tier).toBe(3);
    expect(v.mode).toBe('consent');
    for (const reason of v.reasons) {
      expect(reason).toContain('step "email_merchant"');
    }
  });

  it('on a tie, the FIRST worst step is named (deterministic blame)', () => {
    const v = deriveSopTier([step('archive_a', T2), step('archive_b', T2)]);
    expect(v.reasons[0]).toContain('archive_a');
  });
});

describe('sopGovernorKey — trust belongs to the version', () => {
  it('two versions of the same SOP have distinct track records', () => {
    const v1 = sopGovernorKey({ id: 'close_dormant', version: 1 });
    const v2 = sopGovernorKey({ id: 'close_dormant', version: 2 });
    expect(v1).toBe('sop:close_dormant@v1');
    expect(v2).toBe('sop:close_dormant@v2');
    expect(v1).not.toBe(v2);
  });
});

describe('sopTransition — approval follows verification', () => {
  it('the happy ladder: draft → verified → approved', () => {
    const verified = sopTransition('draft', 'verify_passed');
    expect(verified).toBe('verified');
    expect(sopTransition(verified, 'approved_by_human')).toBe('approved');
  });

  it('a human cannot approve what no oracle verified', () => {
    expect(sopTransition('draft', 'approved_by_human')).toBe('draft');
  });

  it('any edit voids verification AND approval — back to draft', () => {
    expect(sopTransition('verified', 'edited')).toBe('draft');
    expect(sopTransition('approved', 'edited')).toBe('draft');
  });

  it('a failed verification demotes from anywhere (non-retired)', () => {
    expect(sopTransition('draft', 'verify_failed')).toBe('draft');
    expect(sopTransition('verified', 'verify_failed')).toBe('draft');
    expect(sopTransition('approved', 'verify_failed')).toBe('draft');
  });

  it('retired absorbs everything — a SOP never resurrects, it re-versions', () => {
    for (const status of SOP_STATUSES) {
      expect(sopTransition(status, 'retired')).toBe('retired');
    }
    const events: SopEvent[] = ['verify_passed', 'verify_failed', 'approved_by_human', 'edited', 'retired'];
    for (const event of events) {
      expect(sopTransition('retired', event)).toBe('retired');
    }
  });

  it('illegal combinations keep the status, never throw', () => {
    expect(sopTransition('verified', 'verify_passed')).toBe('verified');
    expect(sopTransition('approved', 'verify_passed')).toBe('approved');
    expect(sopTransition('approved', 'approved_by_human')).toBe('approved');
  });
});

describe('sopRunnable — one gate, one status', () => {
  it('only an approved SOP may run', () => {
    const runnable = SOP_STATUSES.filter((s: SopStatus) => sopRunnable(s));
    expect(runnable).toEqual(['approved']);
  });
});
