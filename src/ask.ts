/**
 * subsidium · the ask ledger
 *
 * The pyramid (tier.ts) answers "who must approve this action?". This module
 * answers the question that comes BEFORE it reaches anyone: "is this worth a
 * person at all?". An ask is any interruption whose output is a human doing
 * something — "can someone reach out", "please have a look", a hand-off.
 *
 * Two laws, both about the same scarce thing (a person's minutes):
 *
 *  AN ASK MUST BE WORTH ITS MINUTES — the stake behind the ask, in the
 *  host's own unit, must repay the human time it burns several times over.
 *  An ask that cannot name its stake has not made its case: escalation
 *  bears the burden of proof (principle 1), so unknown is a refusal, not a
 *  free pass. One exception, by design: when the counterpart asked for a
 *  person, a person answers — that is not an escalation, it is a reply.
 *
 *  AN ASK THAT NEVER PAYS LOSES ITS VOICE — every ask kind keeps a record
 *  of what the human's time actually bought. Once the record is long enough
 *  to be read honestly (principle 13: a number without n is a vibe) and the
 *  yield is under the floor, the kind stops interrupting. It is MUTED, not
 *  deleted: its items go to a digest the human reads on their own schedule.
 *
 * Muting grants NO autonomy. The action behind an ask keeps its derived
 * tier; the only thing withheld is the interruption. This is why it does not
 * contradict the yellow-card corollary of principle 5 ("this did not need
 * me" never lowers a tier): nothing here lets the system DO more — it only
 * makes it ASK less.
 *
 * Pure functions, host-persisted records, same shape as the governor.
 */

export interface AskCase {
  /**
   * What a resolution is worth, in the host's unit (dollars of margin at
   * risk, a contract's value…). `null` = the host cannot name it.
   */
  stake: number | null;
  /** Human minutes the ask will burn: reading it AND acting on it. */
  minutes: number;
  /** The counterpart explicitly asked for a person. Always honoured. */
  requestedByCounterpart?: boolean;
}

export interface AskPricing {
  /** What one minute of this human tier costs, in the same unit as `stake`. */
  costPerMinute: number;
  /** The stake must be at least this many times the cost of the ask. */
  minReturn: number;
}

/** A person at $100/h whose time must come back five-fold. */
export const DEFAULT_ASK_PRICING: AskPricing = { costPerMinute: 100 / 60, minReturn: 5 };

export type AskWorth =
  | { worth: true; cost: number; reason: 'requested_by_counterpart' | 'stake_covers_cost' }
  | { worth: false; cost: number; reason: 'stake_unproven' | 'below_cost'; needed: number };

function assertPricing(c: AskCase, p: AskPricing): void {
  if (!(c.minutes > 0) || !(p.costPerMinute > 0) || !(p.minReturn > 0)) {
    throw new Error(
      `ask pricing must be positive (got ${c.minutes} min, ${p.costPerMinute}/min, return x${p.minReturn}): a free human is a turkey — every ask would be "worth it"`,
    );
  }
}

/** Is this ask worth a person's time? The verdict always carries its arithmetic. */
export function askWorth(c: AskCase, pricing: AskPricing = DEFAULT_ASK_PRICING): AskWorth {
  assertPricing(c, pricing);
  const cost = c.minutes * pricing.costPerMinute;
  if (c.requestedByCounterpart === true) return { worth: true, cost, reason: 'requested_by_counterpart' };
  const needed = cost * pricing.minReturn;
  if (c.stake == null || Number.isNaN(c.stake)) return { worth: false, cost, reason: 'stake_unproven', needed };
  if (c.stake < needed) return { worth: false, cost, reason: 'below_cost', needed };
  return { worth: true, cost, reason: 'stake_covers_cost' };
}

/** What became of an ask, judged after the fact. */
export type AskOutcome =
  /** The human's intervention changed the outcome: it was needed. */
  | 'paid'
  /** The human looked and nothing needed them ("nothing blocking on our side"). */
  | 'not_needed'
  /** Nobody answered inside the window. It still cost a notification. */
  | 'unanswered';

export interface AskRecord {
  /** Asks of this kind that reached a human and whose outcome is known. */
  asked: number;
  /** … of which the human's time actually bought something. */
  paid: number;
}

export const EMPTY_ASK_RECORD: AskRecord = { asked: 0, paid: 0 };

export function recordAsk(record: AskRecord, outcome: AskOutcome): AskRecord {
  return { asked: record.asked + 1, paid: record.paid + (outcome === 'paid' ? 1 : 0) };
}

export interface AskYieldPolicy {
  /** Outcomes needed before the yield means anything. */
  minN: number;
  /** Minimum share of asks that must pay for the kind to keep interrupting. */
  minYield: number;
}

/** Twenty outcomes, and at least one ask in ten must have been needed. */
export const DEFAULT_ASK_YIELD_POLICY: AskYieldPolicy = { minN: 20, minYield: 0.1 };

export type AskStanding =
  /** Too few outcomes to judge: the kind may ask (it must earn its record somehow). */
  | { standing: 'unproven'; yield: null; n: number }
  /** Enough outcomes, yield at or above the floor: the kind keeps its voice. */
  | { standing: 'earning'; yield: number; n: number }
  /** Enough outcomes, yield under the floor: digest only, until a review. */
  | { standing: 'muted'; yield: number; n: number };

export function askStanding(record: AskRecord, policy: AskYieldPolicy = DEFAULT_ASK_YIELD_POLICY): AskStanding {
  if (!(policy.minN > 0) || !(policy.minYield > 0) || policy.minYield > 1) {
    throw new Error(
      `ask yield policy must have minN > 0 and 0 < minYield <= 1 (got minN=${policy.minN}, minYield=${policy.minYield}): a floor of zero never mutes anything`,
    );
  }
  if (record.asked < policy.minN) return { standing: 'unproven', yield: null, n: record.asked };
  const y = record.paid / record.asked;
  return y >= policy.minYield ? { standing: 'earning', yield: y, n: record.asked } : { standing: 'muted', yield: y, n: record.asked };
}

/**
 * A human reviewed a muted kind (the ask was reworded, its trigger fixed, or
 * the mute was simply wrong). The record restarts from zero: the kind is
 * `unproven` again and must re-earn its voice. Same contract as the
 * governor's reset — the mute is an alarm, not a criminal record.
 */
export function reviewAsk(): AskRecord {
  return { ...EMPTY_ASK_RECORD };
}

export type AskGate =
  | { interrupt: true; reasons: readonly string[] }
  | { interrupt: false; route: 'drop' | 'digest'; reasons: readonly string[] };

/**
 * The whole door, in order: worth first (a worthless ask is dropped — a
 * digest full of them is the same firehose, slower), then the kind's
 * standing (muted → digest). The attention budget (`admit`) comes after
 * this gate, never instead of it: a budget rations asks that deserved to
 * exist. `reasons` is never empty — a gate that cannot say why is a mood.
 */
export function gateAsk(
  c: AskCase,
  record: AskRecord,
  pricing: AskPricing = DEFAULT_ASK_PRICING,
  policy: AskYieldPolicy = DEFAULT_ASK_YIELD_POLICY,
): AskGate {
  const worth = askWorth(c, pricing);
  if (!worth.worth) {
    return {
      interrupt: false,
      route: 'drop',
      reasons: [
        worth.reason === 'stake_unproven'
          ? `stake unproven: the ask costs ${round(worth.cost)} and must show at least ${round(worth.needed)}`
          : `stake ${round(c.stake as number)} < ${round(worth.needed)} (${c.minutes} min at ${round(pricing.costPerMinute)}/min, x${pricing.minReturn})`,
      ],
    };
  }
  if (worth.reason === 'requested_by_counterpart') {
    return { interrupt: true, reasons: ['the counterpart asked for a person'] };
  }
  const s = askStanding(record, policy);
  if (s.standing === 'muted') {
    return {
      interrupt: false,
      route: 'digest',
      reasons: [`this kind paid ${pct(s.yield)} of ${s.n} asks, under the ${pct(policy.minYield)} floor: digest until reviewed`],
    };
  }
  return {
    interrupt: true,
    reasons: [
      `stake ${round(c.stake as number)} covers ${round(worth.cost)} x${pricing.minReturn}`,
      s.standing === 'unproven' ? `kind unproven (n=${s.n} < ${policy.minN})` : `kind pays ${pct(s.yield)} of ${s.n} asks`,
    ],
  };
}

const round = (n: number): number => Math.round(n * 100) / 100;
const pct = (r: number): string => `${Math.round(r * 100)}%`;
