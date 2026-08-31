/**
 * Public API surface — imported through the package entry point, the way a
 * consumer will. Locks the contract: removing or renaming an export is a
 * breaking change and must fail here first, not in a consumer's build.
 */
import { describe, expect, it } from 'vitest';
import * as subsidium from '../src/index';

describe('the package surface', () => {
  it('exports every documented primitive', () => {
    // Values (functions, classes, constants) — types are erased at runtime
    // and locked by the typecheck instead.
    const expected = [
      'TIER_MODE',
      'deriveTier',
      'tierInput',
      'TierGovernor',
      'DEFAULT_GOVERNOR_OPTIONS',
      'transition',
      'nextMove',
      'countsAsReply',
      'DEFAULT_THREAD_POLICY',
      'THREAD_STATUSES',
      'admit',
      'rollover',
      'EMPTY_ATTENTION',
      'buildEscalationSignal',
      'MAX_SUMMARY_LENGTH',
      'lcg',
      'simulateGating',
      'simulateOutreach',
      'simulateSopGating',
      'averageGating',
      'averageSop',
      'convergentWorld',
      'defaultWorld',
      'defaultSopWorld',
      'whyEscalated',
      'tierMeta',
      'bandByTier',
      'countByTier',
      'deriveSopTier',
      'sopGovernorKey',
      'sopTransition',
      'sopRunnable',
      'SOP_STATUSES',
      'reading',
      'judge',
      'DEFAULT_JUDGE_OPTIONS',
    ];
    for (const name of expected) {
      expect(subsidium, name).toHaveProperty(name);
    }
  });

  it('TIER_MODE covers exactly the six tiers, in pyramid order', () => {
    expect(subsidium.TIER_MODE).toEqual({
      0: 'auto_silent',
      1: 'auto_notify',
      2: 'veto',
      3: 'consent',
      4: 'human_decision',
      5: 'out_of_scope',
    });
  });

  it('works end to end through the entry point', () => {
    const v = subsidium.deriveTier(
      subsidium.tierInput(
        { reversible: true, domain: 'complicated' },
        { id: 'merchant_chat', reversible: false, externallyVisible: true, observable: true },
      ),
    );
    expect(v.tier).toBe(3);
    expect(v.mode).toBe('consent');
  });
});
