/**
 * Interfaces between groups — principles 17, 18 and 19.
 *
 * Fixtures come from the reference host's first measurement (30 days of
 * internal chat, 2026-10-18), group names generic: the busiest seam took 184
 * asks with a 2 h median answer and 56 multi-turn loops; a review group
 * answered 90% of its cross-group asks through one person.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRIDGE_POLICY,
  DEFAULT_DIVERGENCE_POLICY,
  DEFAULT_INTERFACE_PRICING,
  bridgeLoad,
  congruence,
  divergence,
  interfaceCost,
  interfaceCostSpec,
  rankInterfaces,
  type InterfaceObservation,
} from '../src/interface';
import { judge, reading } from '../src/measure';

const NOW = Date.UTC(2026, 9, 18);
const DAY = 86_400_000;
const seam = (over: Partial<InterfaceObservation> = {}): InterfaceObservation => ({
  from: 'sales',
  to: 'engineering',
  asks: 10,
  waits: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  loops: 0,
  nudges: 0,
  escalations: 0,
  ...over,
});

describe('interfaceCost — a seam is priced by what it costs (principle 17)', () => {
  it('prices waiting, silence, loops, nudges and escalations in the host unit', () => {
    const c = interfaceCost(seam({ asks: 4, waits: [2, 4], loops: 1, nudges: 2, escalations: 1 }), DEFAULT_INTERFACE_PRICING, NOW);
    // 6 h × 5 + 2 unanswered × 72 h × 5 + (60 + 30 + 60) min × 100/60
    expect(c.parts.waiting).toBe(30);
    expect(c.parts.silence).toBe(720);
    expect(c.parts.loops).toBeCloseTo(100);
    expect(c.parts.nudges).toBeCloseTo(50);
    expect(c.parts.escalations).toBeCloseTo(100);
    expect(c.total).toBeCloseTo(1000);
    expect(c.perAsk).toBeCloseTo(250);
    expect(c.unansweredShare).toBe(0.5);
    expect(c.medianWait).toBe(3);
    expect(c.mode).toBe('service');
    expect(c.reasons[0]).toBe('silence is 72% of the price');
    expect(c.reasons[1]).toMatch(/2 of 4 asks never answered/);
  });

  it('silence is not free: an unanswered ask costs more than a slow answer', () => {
    const slow = interfaceCost(seam({ asks: 1, waits: [48] }), DEFAULT_INTERFACE_PRICING, NOW);
    const silent = interfaceCost(seam({ asks: 1, waits: [] }), DEFAULT_INTERFACE_PRICING, NOW);
    expect(silent.total).toBeGreaterThan(slow.total);
    expect(silent.medianWait).toBeNull();
  });

  it('the median holds for an odd count too', () => {
    expect(interfaceCost(seam({ asks: 3, waits: [9, 1, 4] }), DEFAULT_INTERFACE_PRICING, NOW).medianWait).toBe(4);
  });

  it('the reference seam: volume and loops, not waiting, make the price', () => {
    const waits = Array(180).fill(2);
    const c = interfaceCost(seam({ asks: 184, waits, loops: 56, nudges: 6 }), DEFAULT_INTERFACE_PRICING, NOW);
    expect(c.reasons[0]).toMatch(/^loops is \d+% of the price$/);
    expect(c.parts.loops).toBeGreaterThan(c.parts.waiting);
  });

  it('an instant, fully answered seam costs nothing and says so', () => {
    const c = interfaceCost(seam({ asks: 2, waits: [0, 0] }), DEFAULT_INTERFACE_PRICING, NOW);
    expect(c.total).toBe(0);
    expect(c.reasons).toEqual(['nothing to charge: every ask answered at once']);
  });

  it('in a live collaboration the back-and-forth is the work, not rework', () => {
    const live = interfaceCost(seam({ mode: 'collaboration', endsAt: NOW + 14 * DAY, loops: 20 }), DEFAULT_INTERFACE_PRICING, NOW);
    expect(live.parts.loops).toBe(0);
    expect(live.openEnded).toBe(false);
    const asService = interfaceCost(seam({ loops: 20 }), DEFAULT_INTERFACE_PRICING, NOW);
    expect(asService.parts.loops).toBeGreaterThan(0);
  });

  it('a collaboration with no end date, or a past one, is priced as a service seam', () => {
    for (const endsAt of [undefined, null, NOW - DAY, NOW]) {
      const c = interfaceCost(seam({ mode: 'facilitating', endsAt, loops: 3 }), DEFAULT_INTERFACE_PRICING, NOW);
      expect(c.openEnded, String(endsAt)).toBe(true);
      expect(c.parts.loops).toBeCloseTo(300);
      expect(c.reasons.some((r) => r.startsWith('facilitating without a live end date'))).toBe(true);
    }
  });

  it('uses the clock when no `now` is given', () => {
    expect(interfaceCost(seam({ mode: 'collaboration', endsAt: Date.now() + DAY })).openEnded).toBe(false);
  });

  it('refuses observations that cannot be true', () => {
    expect(() => interfaceCost(seam({ asks: 0, waits: [] }))).toThrow(/no asks/);
    expect(() => interfaceCost(seam({ asks: 1, waits: [1, 2] }))).toThrow(/more answers/);
    expect(() => interfaceCost(seam({ asks: 1, waits: [-1] }))).toThrow(/negative/);
    expect(() => interfaceCost(seam({ loops: 1.5 }))).toThrow(/non-negative integer/);
    expect(() => interfaceCost(seam({ nudges: -1 }))).toThrow(/non-negative integer/);
  });

  it('refuses free pricing: a free minute or a free silence is a turkey', () => {
    const p = DEFAULT_INTERFACE_PRICING;
    expect(() => interfaceCost(seam(), { ...p, costPerMinute: 0 })).toThrow(/turkey/);
    expect(() => interfaceCost(seam(), { ...p, delayCostPerHour: 0 })).toThrow(/turkey/);
    expect(() => interfaceCost(seam(), { ...p, unansweredHours: 0 })).toThrow(/turkey/);
    expect(() => interfaceCost(seam(), { ...p, minutes: { ...p.minutes, loop: 0 } })).toThrow(/turkey/);
  });
});

describe('interfaceCostSpec — repricing people does not make a seam cheaper', () => {
  it('pins the pricing into the definition, so a repriced reading is not comparable', () => {
    const before = interfaceCostSpec();
    const after = interfaceCostSpec({ ...DEFAULT_INTERFACE_PRICING, costPerMinute: 50 / 60 });
    expect(before.direction).toBe('down');
    expect(before.definition).not.toBe(after.definition);
    const v = judge(after, reading(after, 80, 50), reading(before, 120, 50));
    expect(v.verdict).toBe('not_comparable');
  });

  it('defaults to the default pricing', () => {
    expect(interfaceCostSpec()).toEqual(interfaceCostSpec(DEFAULT_INTERFACE_PRICING));
  });

  it('same pricing, same definition: a real improvement is judged as one', () => {
    const spec = interfaceCostSpec();
    expect(judge(spec, reading(spec, 60, 40), reading(spec, 120, 40)).verdict).toBe('improved');
  });
});

describe('rankInterfaces — compared to what? to the other seams', () => {
  const obs = [
    seam({ from: 'a', to: 'b', asks: 10, waits: Array(10).fill(1) }), // 5/ask
    seam({ from: 'b', to: 'c', asks: 10, waits: Array(10).fill(10) }), // 50/ask
    seam({ from: 'c', to: 'a', asks: 10, waits: Array(5).fill(1) }), // silence-heavy
    seam({ from: 'a', to: 'c', asks: 2, waits: [100, 100] }), // too few asks
  ];

  it('bands the costliest third blocking, sorts by total price, leaves small seams too_early', () => {
    const r = rankInterfaces(obs, DEFAULT_INTERFACE_PRICING, { minN: 5 }, NOW);
    expect(r.map((x) => `${x.from}${x.to}`)).toEqual(['ca', 'ac', 'bc', 'ab']);
    expect(Object.fromEntries(r.map((x) => [`${x.from}${x.to}`, x.band]))).toEqual({
      ca: 'blocking',
      bc: 'strained',
      ac: 'too_early',
      ab: 'fluid',
    });
  });

  it('fewer than three judged seams: nothing is ranked against nothing', () => {
    const r = rankInterfaces(obs.slice(0, 2), DEFAULT_INTERFACE_PRICING, { minN: 5 }, NOW);
    expect(r.every((x) => x.band === 'too_early')).toBe(true);
  });

  it('works with every default', () => {
    expect(rankInterfaces(obs)).toHaveLength(4);
  });

  it('refuses a minN under one', () => {
    expect(() => rankInterfaces(obs, DEFAULT_INTERFACE_PRICING, { minN: 0 })).toThrow(/minN/);
  });
});

describe('congruence — the seams the process needs vs the seams people use (principle 18)', () => {
  it('Cataldo: 10 required, 5 used is 0.5; the rest are named gaps and bypasses', () => {
    const required = Array.from({ length: 10 }, (_, i) => ({ from: 'g' + i, to: 'h' }));
    const observed = [...required.slice(0, 5), { from: 'x', to: 'founder' }, { from: 'x', to: 'founder' }];
    const c = congruence(required, observed);
    expect(c.score).toBe(0.5);
    expect(c.gaps.map((s) => s.from)).toEqual(['g5', 'g6', 'g7', 'g8', 'g9']);
    expect(c.bypasses).toEqual([{ from: 'x', to: 'founder' }]);
  });

  it('is directed: a → b does not satisfy b → a', () => {
    expect(congruence([{ from: 'a', to: 'b' }], [{ from: 'b', to: 'a' }]).score).toBe(0);
  });

  it('an empty process map agrees with everything, so it throws', () => {
    expect(() => congruence([], [{ from: 'a', to: 'b' }])).toThrow(/empty process map/);
  });
});

describe('divergence — the rule and the people decide the same company (principle 18)', () => {
  const order = ['accept', 'hold', 'refuse'];
  const pairs = (agree: number, looser: number, stricter: number, odd = 0) => [
    ...Array(agree).fill({ rule: 'hold', human: 'hold' }),
    ...Array(looser).fill({ rule: 'refuse', human: 'accept' }),
    ...Array(stricter).fill({ rule: 'accept', human: 'refuse' }),
    ...Array(odd).fill({ rule: 'accept', human: 'escalate' }),
  ];

  it('the reference host: people accept what the rule refused, and the reverse', () => {
    const v = divergence(pairs(70, 28, 62), { minN: 20, maxRate: 0.1, strictness: order });
    expect(v.status).toBe('diverging');
    if (v.status === 'too_early') throw new Error('unreachable');
    expect(v.looser).toBe(28);
    expect(v.stricter).toBe(62);
    expect(v.rate).toBeCloseTo(90 / 160);
    expect(v.reasons[2]).toMatch(/change the rule or change the guide/);
  });

  it('under the ceiling the two are aligned, and a decision outside the order is unordered', () => {
    const v = divergence(pairs(27, 0, 1, 1), { ...DEFAULT_DIVERGENCE_POLICY, strictness: order });
    expect(v.status).toBe('aligned');
    if (v.status === 'too_early') throw new Error('unreachable');
    expect(v.unordered).toBe(1);
    expect(v.reasons).toHaveLength(2);
  });

  it('without an order every disagreement is unordered, and agreement says nothing more', () => {
    const v = divergence(pairs(25, 0, 0));
    expect(v).toMatchObject({ status: 'aligned', rate: 0, looser: 0, stricter: 0, unordered: 0 });
    if (v.status === 'too_early') throw new Error('unreachable');
    expect(v.reasons).toHaveLength(1);
    const w = divergence(pairs(10, 10, 0));
    expect(w).toMatchObject({ status: 'diverging', unordered: 10 });
  });

  it('below minN it is an anecdote', () => {
    expect(divergence(pairs(3, 3, 3))).toMatchObject({ status: 'too_early', n: 9, rate: null });
  });

  it('refuses ceilings that flag everything or nothing', () => {
    expect(() => divergence([], { minN: 20, maxRate: 0 })).toThrow(/ceiling/);
    expect(() => divergence([], { minN: 20, maxRate: 1 })).toThrow(/ceiling/);
    expect(() => divergence([], { minN: 0, maxRate: 0.1 })).toThrow(/minN/);
  });
});

describe('bridgeLoad — no one is the only bridge (principle 19)', () => {
  it('the reference host: one person answers 90% of a group, it is named first', () => {
    const r = bridgeLoad([
      { actor: 'reviewer-1', group: 'review', answers: 83 },
      { actor: 'reviewer-2', group: 'review', answers: 9 },
      { actor: 'dev-1', group: 'engineering', answers: 81 },
      { actor: 'dev-2', group: 'engineering', answers: 61 },
      { actor: 'dev-3', group: 'engineering', answers: 60 },
      { actor: 'dev-4', group: 'engineering', answers: 120 },
      { actor: 'fin-1', group: 'finance', answers: 12 },
    ]);
    expect(r.map((b) => [b.group, b.status])).toEqual([
      ['review', 'single_bridge'],
      ['engineering', 'spread'],
      ['finance', 'too_early'],
    ]);
    expect(r[0].top).toMatchObject({ actor: 'reviewer-1', answers: 83 });
    expect(r[0].top.share).toBeCloseTo(0.9, 2);
    expect(r[1].top.actor).toBe('dev-4');
  });

  it('merges repeated rows, breaks ties by name, sorts single bridges by share', () => {
    const r = bridgeLoad(
      [
        { actor: 'b', group: 'g1', answers: 10 },
        { actor: 'a', group: 'g1', answers: 10 },
        { actor: 'a', group: 'g1', answers: 5 },
        { actor: 'z', group: 'g2', answers: 30 },
        { actor: 'y', group: 'g2', answers: 1 },
      ],
      { minN: 5, maxShare: 0.5 },
    );
    expect(r.map((b) => [b.group, b.top.actor, b.top.answers])).toEqual([
      ['g2', 'z', 30],
      ['g1', 'a', 15],
    ]);
    const tie = bridgeLoad([{ actor: 'b', group: 'g', answers: 3 }, { actor: 'a', group: 'g', answers: 3 }], { minN: 1, maxShare: 0.6 });
    expect(tie[0]).toMatchObject({ status: 'spread', top: { actor: 'a' } });
  });

  it('a group that gave nothing is not reported', () => {
    expect(bridgeLoad([{ actor: 'a', group: 'quiet', answers: 0 }])).toEqual([]);
  });

  it('refuses impossible counts and shares that never flag', () => {
    expect(() => bridgeLoad([{ actor: 'a', group: 'g', answers: -1 }])).toThrow(/non-negative/);
    expect(() => bridgeLoad([], { ...DEFAULT_BRIDGE_POLICY, maxShare: 1 })).toThrow(/never flags/);
    expect(() => bridgeLoad([], { ...DEFAULT_BRIDGE_POLICY, minN: 0 })).toThrow(/minN/);
  });
});
