/**
 * The ask ledger — "is this worth a person at all?" (principles 15 and 16).
 *
 * Origin case, used as the fixture throughout: a merchant worth $294 of
 * volume over 90 days whose sales had stopped 40 days earlier. The system
 * asked the account manager, then asked a tech channel two days later; a
 * lead engineer spent two hours to conclude "nothing blocking on our side".
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ASK_PRICING,
  DEFAULT_ASK_YIELD_POLICY,
  EMPTY_ASK_RECORD,
  askStanding,
  askWorth,
  gateAsk,
  recordAsk,
  reviewAsk,
  type AskRecord,
} from '../src/ask';

const HOUR_100: typeof DEFAULT_ASK_PRICING = { costPerMinute: 100 / 60, minReturn: 5 };

describe('askWorth — an ask must be worth its minutes', () => {
  it('the origin case: $14.70 of margin at stake cannot buy 30 minutes of a person', () => {
    const v = askWorth({ stake: 14.7, minutes: 30 }, HOUR_100);
    expect(v.worth).toBe(false);
    expect(v).toMatchObject({ reason: 'below_cost' });
    expect(v.cost).toBeCloseTo(50);
    if (!v.worth) expect(v.needed).toBeCloseTo(250);
  });

  it('a stake that repays the time five-fold passes, exactly at the boundary too', () => {
    expect(askWorth({ stake: 2_000, minutes: 30 }, HOUR_100)).toMatchObject({ worth: true, reason: 'stake_covers_cost' });
    expect(askWorth({ stake: 250, minutes: 30 }, HOUR_100).worth).toBe(true);
    expect(askWorth({ stake: 249.99, minutes: 30 }, HOUR_100).worth).toBe(false);
  });

  it('an ask that cannot name its stake has not made its case (fail closed)', () => {
    expect(askWorth({ stake: null, minutes: 10 })).toMatchObject({ worth: false, reason: 'stake_unproven' });
    expect(askWorth({ stake: Number.NaN, minutes: 10 })).toMatchObject({ worth: false, reason: 'stake_unproven' });
  });

  it('when the counterpart asked for a person, a person answers — whatever the stake', () => {
    expect(askWorth({ stake: 0, minutes: 30, requestedByCounterpart: true })).toMatchObject({
      worth: true,
      reason: 'requested_by_counterpart',
    });
    expect(askWorth({ stake: null, minutes: 30, requestedByCounterpart: true }).worth).toBe(true);
  });

  it('a longer ask needs a bigger stake (monotone in minutes)', () => {
    expect(askWorth({ stake: 400, minutes: 30 }, HOUR_100).worth).toBe(true);
    expect(askWorth({ stake: 400, minutes: 120 }, HOUR_100).worth).toBe(false);
  });

  it('a free human is a turkey: non-positive pricing throws instead of approving everything', () => {
    expect(() => askWorth({ stake: 1, minutes: 0 })).toThrow(/free human/);
    expect(() => askWorth({ stake: 1, minutes: 10 }, { costPerMinute: 0, minReturn: 5 })).toThrow(/free human/);
    expect(() => askWorth({ stake: 1, minutes: 10 }, { costPerMinute: 1, minReturn: 0 })).toThrow(/free human/);
    expect(() => askWorth({ stake: 1, minutes: Number.NaN })).toThrow(/free human/);
  });
});

describe('recordAsk / askStanding — an ask that never pays loses its voice', () => {
  const after = (paid: number, wasted: number, unanswered = 0): AskRecord => {
    let r = EMPTY_ASK_RECORD;
    for (let i = 0; i < paid; i++) r = recordAsk(r, 'paid');
    for (let i = 0; i < wasted; i++) r = recordAsk(r, 'not_needed');
    for (let i = 0; i < unanswered; i++) r = recordAsk(r, 'unanswered');
    return r;
  };

  it('only a paid outcome counts as yield; an unanswered ask still cost a notification', () => {
    expect(after(1, 1, 1)).toEqual({ asked: 3, paid: 1 });
    expect(EMPTY_ASK_RECORD).toEqual({ asked: 0, paid: 0 });
  });

  it('below minN the kind is unproven — never "muted on an anecdote" (principle 13)', () => {
    expect(askStanding(after(0, 19))).toEqual({ standing: 'unproven', yield: null, n: 19 });
  });

  it('prod audit: 4 unblocks out of 63 asks (6%) is under the 10% floor → muted', () => {
    const s = askStanding(after(4, 59));
    expect(s.standing).toBe('muted');
    expect(s.yield).toBeCloseTo(4 / 63);
  });

  it('at or above the floor the kind keeps its voice (boundary included)', () => {
    expect(askStanding(after(2, 18))).toEqual({ standing: 'earning', yield: 0.1, n: 20 });
    expect(askStanding(after(1, 19)).standing).toBe('muted');
  });

  it('a review restarts the record: the kind must re-earn its voice from zero', () => {
    const fresh = reviewAsk();
    expect(fresh).toEqual({ asked: 0, paid: 0 });
    expect(fresh).not.toBe(EMPTY_ASK_RECORD);
    expect(askStanding(fresh).standing).toBe('unproven');
  });

  it('a floor that can never mute is a turkey: it throws', () => {
    expect(() => askStanding(after(1, 1), { minN: 0, minYield: 0.1 })).toThrow(/never mutes/);
    expect(() => askStanding(after(1, 1), { minN: 20, minYield: 0 })).toThrow(/never mutes/);
    expect(() => askStanding(after(1, 1), { minN: 20, minYield: 1.5 })).toThrow(/never mutes/);
  });

  it('defaults: twenty outcomes, one in ten', () => {
    expect(DEFAULT_ASK_YIELD_POLICY).toEqual({ minN: 20, minYield: 0.1 });
    expect(DEFAULT_ASK_PRICING.minReturn).toBe(5);
  });
});

describe('gateAsk — the whole door, and it always says why', () => {
  const earning: AskRecord = { asked: 40, paid: 12 };
  const muted: AskRecord = { asked: 63, paid: 4 };

  it('the origin case is dropped, with its arithmetic', () => {
    const g = gateAsk({ stake: 14.7, minutes: 30 }, EMPTY_ASK_RECORD, HOUR_100);
    expect(g).toMatchObject({ interrupt: false, route: 'drop' });
    expect(g.reasons[0]).toMatch(/stake 14\.7 < 250/);
  });

  it('an unproven stake is dropped and told what it would need to show', () => {
    const g = gateAsk({ stake: null, minutes: 30 }, earning, HOUR_100);
    expect(g).toMatchObject({ interrupt: false, route: 'drop' });
    expect(g.reasons[0]).toMatch(/stake unproven.*at least 250/);
  });

  it('a worthy ask of a muted kind goes to the digest, not to the person', () => {
    const g = gateAsk({ stake: 5_000, minutes: 30 }, muted, HOUR_100);
    expect(g).toMatchObject({ interrupt: false, route: 'digest' });
    expect(g.reasons[0]).toMatch(/paid 6% of 63 asks, under the 10% floor/);
  });

  it('a worthy ask of an earning or unproven kind interrupts, with both reasons', () => {
    const e = gateAsk({ stake: 5_000, minutes: 30 }, earning, HOUR_100);
    expect(e.interrupt).toBe(true);
    expect(e.reasons).toEqual(['stake 5000 covers 50 x5', 'kind pays 30% of 40 asks']);
    const u = gateAsk({ stake: 5_000, minutes: 30 }, EMPTY_ASK_RECORD);
    expect(u.interrupt).toBe(true);
    expect(u.reasons[1]).toBe('kind unproven (n=0 < 20)');
  });

  it('a person who was asked for answers even when the kind is muted', () => {
    const g = gateAsk({ stake: null, minutes: 30, requestedByCounterpart: true }, muted);
    expect(g).toEqual({ interrupt: true, reasons: ['the counterpart asked for a person'] });
  });

  it('reasons are never empty, on any path', () => {
    const cases = [
      gateAsk({ stake: 1, minutes: 30 }, EMPTY_ASK_RECORD),
      gateAsk({ stake: null, minutes: 30 }, EMPTY_ASK_RECORD),
      gateAsk({ stake: 9_999, minutes: 30 }, muted),
      gateAsk({ stake: 9_999, minutes: 30 }, earning),
      gateAsk({ stake: 0, minutes: 5, requestedByCounterpart: true }, muted),
    ];
    for (const g of cases) expect(g.reasons.length).toBeGreaterThan(0);
  });
});
