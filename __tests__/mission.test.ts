import { describe, expect, it } from 'vitest';
import {
  gateToolCall,
  missionGovernorKey,
  missionTier,
  TierGovernor,
  type MissionSpec,
} from '../src/index';

/**
 * Fixture: the reserve danger scan — the founder's canonical mission
 * (2026-08-31). An agent sizes reserve holds across the fleet:
 * H = 1.25 × exposure, compared to the held reserve. Reading is free,
 * raising a reserve touches a merchant's money, targets above the 40% cap
 * have no right answer, and closing a merchant is refused outright.
 */
const reserveScan: MissionSpec = {
  id: 'reserve-danger-scan',
  version: 1,
  goal: 'size reserve holds across the fleet and fix the material gaps',
  mandate: 1,
  tools: [
    {
      kind: 'scan_fleet',
      title: 'read volumes, disputes, alerts, debt (read-only)',
      input: { reversible: true, externallyVisible: false, domain: 'clear' },
    },
    {
      kind: 'project_incoming',
      title: 'project incoming disputes from the charge→dispute lag CDF',
      input: { reversible: true, externallyVisible: false, domain: 'complicated' },
    },
    {
      kind: 'raise_reserve',
      title: 'raise a merchant reserve % (merchant sees payouts shrink)',
      input: { reversible: true, externallyVisible: true, domain: 'complicated' },
    },
    {
      kind: 'review_above_cap',
      title: 'target above the 40% cap — no right answer, human frames',
      input: { reversible: true, externallyVisible: false, domain: 'complex' },
    },
    {
      kind: 'close_merchant',
      title: 'terminate a merchant account',
      input: { reversible: false, externallyVisible: true, domain: 'complex' },
      outOfScope: true,
    },
  ],
};

describe('gateToolCall — no raw hands', () => {
  it('refuses an undeclared tool, fail closed', () => {
    const d = gateToolCall(reserveScan, 'delete_database');
    expect(d.allow).toBe(false);
    if (!d.allow) {
      expect(d.outcome).toBe('refuse');
      expect(d.reason).toContain('undeclared');
    }
  });

  it('refuses a declared out-of-scope tool with its name in the reason', () => {
    const d = gateToolCall(reserveScan, 'close_merchant');
    expect(d.allow).toBe(false);
    if (!d.allow && d.outcome === 'refuse') {
      expect(d.reason).toContain('close_merchant');
      expect(d.reason).toContain('T5');
    }
  });
});

describe('gateToolCall — mandate', () => {
  it('lets tools at or below the mandate through without stopping', () => {
    expect(gateToolCall(reserveScan, 'scan_fleet').allow).toBe(true);
    expect(gateToolCall(reserveScan, 'project_incoming').allow).toBe(true);
  });

  it('pauses a tool above the mandate, with the tier reasons attached', () => {
    const d = gateToolCall(reserveScan, 'raise_reserve');
    expect(d.allow).toBe(false);
    if (!d.allow && d.outcome === 'pause') {
      expect(d.verdict.tier).toBe(2);
      expect(d.reason).toContain('mandate T1');
      expect(d.verdict.reasons.length).toBeGreaterThan(0);
    }
  });

  it('always pauses complex-domain tools (T4 can never fit a legal mandate)', () => {
    const d = gateToolCall(reserveScan, 'review_above_cap');
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.outcome).toBe('pause');
  });

  it('rejects a mandate above T2 — T3+ is by definition a human gate', () => {
    expect(() => gateToolCall({ ...reserveScan, mandate: 3 }, 'scan_fleet')).toThrow(/human gate/);
  });
});

describe('gateToolCall — earned autonomy per (version × tool kind)', () => {
  it('a clean track record promotes raise_reserve into the mandate; a contest snaps it back', () => {
    const gov = new TierGovernor();
    const key = missionGovernorKey(reserveScan, 'raise_reserve');
    for (let i = 0; i < 25; i++) gov.record(key, 'success');

    const promoted = gateToolCall(reserveScan, 'raise_reserve', gov);
    expect(promoted.allow).toBe(true);
    if (promoted.allow) expect(promoted.verdict.tier).toBe(1);

    gov.contestUp(key); // "this needed me" — instant, sticky demotion
    const demoted = gateToolCall(reserveScan, 'raise_reserve', gov);
    expect(demoted.allow).toBe(false);
  });

  it('trust does not survive a version bump — the v2 agent re-earns from zero', () => {
    const gov = new TierGovernor();
    const keyV1 = missionGovernorKey(reserveScan, 'raise_reserve');
    for (let i = 0; i < 25; i++) gov.record(keyV1, 'success');

    const v2 = { ...reserveScan, version: 2 };
    expect(missionGovernorKey(v2, 'raise_reserve')).not.toBe(keyV1);
    const d = gateToolCall(v2, 'raise_reserve', gov);
    expect(d.allow).toBe(false);
  });
});

describe('missionTier — a run is a dynamic SOP', () => {
  it('is the weakest link over the tools actually called', () => {
    expect(missionTier([0, 1, 2])).toBe(2);
    expect(missionTier([0, 0])).toBe(0);
  });

  it('a run that touched nothing sits at T0', () => {
    expect(missionTier([])).toBe(0);
  });
});
