/**
 * The pyramid classifier. Every cell of the table is pinned, because the
 * tier decides whether a human is disturbed: a silent regression here is a
 * regression in someone's day.
 */
import { describe, expect, it } from 'vitest';
import { deriveTier, tierInput } from '../src/tier';
import type { ChannelSpec } from '../src/types';

const merchantSlack: ChannelSpec = {
  id: 'slack_merchant',
  reversible: false,
  externallyVisible: true,
  observable: true,
};

const internalNote: ChannelSpec = {
  id: 'internal_note',
  reversible: true,
  externallyVisible: false,
  observable: true,
};

describe('deriveTier — the table', () => {
  it('internal + reversible + clear = T0, and T0 needs no reason', () => {
    const v = deriveTier({ reversible: true, externallyVisible: false, domain: 'clear' });
    expect(v).toEqual({ tier: 0, mode: 'auto_silent', reasons: [] });
  });

  it('internal + reversible + complicated = T1: act, then tell', () => {
    const v = deriveTier({ reversible: true, externallyVisible: false, domain: 'complicated' });
    expect(v.tier).toBe(1);
    expect(v.mode).toBe('auto_notify');
  });

  it('internal + irreversible = T2: veto window', () => {
    const v = deriveTier({ reversible: false, externallyVisible: false, domain: 'clear' });
    expect(v.tier).toBe(2);
    expect(v.mode).toBe('veto');
  });

  it('externally visible + reversible = T2', () => {
    const v = deriveTier({ reversible: true, externallyVisible: true, domain: 'clear' });
    expect(v.tier).toBe(2);
  });

  it('externally visible + irreversible = T3: consent — a merchant message', () => {
    const v = deriveTier({ reversible: false, externallyVisible: true, domain: 'clear' });
    expect(v.tier).toBe(3);
    expect(v.mode).toBe('consent');
  });

  it('complex domain dominates everything = T4', () => {
    const v = deriveTier({ reversible: true, externallyVisible: false, domain: 'complex' });
    expect(v.tier).toBe(4);
    expect(v.mode).toBe('human_decision');
  });
});

describe('escalation bears the burden of proof', () => {
  it('every tier above 0 carries at least one human-readable reason', () => {
    const inputs = [
      { reversible: true, externallyVisible: false, domain: 'complicated' as const },
      { reversible: false, externallyVisible: false, domain: 'clear' as const },
      { reversible: true, externallyVisible: true, domain: 'clear' as const },
      { reversible: false, externallyVisible: true, domain: 'clear' as const },
      { reversible: false, externallyVisible: true, domain: 'complex' as const },
    ];
    for (const input of inputs) {
      const v = deriveTier(input);
      expect(v.tier).toBeGreaterThan(0);
      expect(v.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe('tierInput — action × channel composition', () => {
  it('a reversible action on an irreversible channel is irreversible', () => {
    const input = tierInput({ reversible: true, domain: 'clear' }, merchantSlack);
    expect(input.reversible).toBe(false);
    expect(deriveTier(input).tier).toBe(3);
  });

  it('an internal action inherits nothing external', () => {
    const input = tierInput({ reversible: true, domain: 'clear' }, internalNote);
    expect(deriveTier(input).tier).toBe(0);
  });

  it('a channel-less action is judged on its own properties', () => {
    const input = tierInput({ reversible: false, domain: 'clear' }, null);
    expect(input.externallyVisible).toBe(false);
    expect(deriveTier(input).tier).toBe(2);
  });
});
