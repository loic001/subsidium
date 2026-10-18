/**
 * subsidium · interfaces between groups
 *
 * The pyramid prices one action; the ask ledger prices one interruption.
 * This module prices the SEAM between two groups of a company (teams,
 * functions, a person and a system): what it costs to get something from
 * one side to the other, whether the seams people use are the ones the
 * process says they should use, and whether one person is holding a seam up
 * alone. "Group" is the host's word: a pole, a team, a desk, a system that
 * decides. Nothing here knows what business the host is in.
 *
 * Three laws:
 *
 *  AN INTERFACE IS PRICED BY WHAT IT COSTS, NOT BY HOW MUCH IT TALKS
 *  (principle 17). Coase and Williamson: the cost of an exchange is a cost
 *  of the firm. Reinertsen: in knowledge work the queue dominates the work.
 *  The price of a seam is waiting time × the cost of delay, plus the human
 *  minutes burned on loops, nudges and escalations, in the host's unit.
 *  Silence is not free: an ask nobody answered is charged a wait, never
 *  zero. Volume alone is not friction: in COLLABORATION mode (Team
 *  Topologies) the back-and-forth IS the work and is not charged as rework —
 *  but a collaboration without an end date is a seam nobody designed, and
 *  is priced as one.
 *
 *  THE MAP AND THE TERRITORY MUST AGREE (principle 18). Conway, and the
 *  mirroring hypothesis: an organization reproduces its communication
 *  structure. Two checks. Congruence (Cataldo, Herbsleb & Carley 2008):
 *  of the seams the process REQUIRES, how many are actually used; the ones
 *  used but not required are bypasses. Divergence: when a rule and a person
 *  decide the same case, how often they disagree, and in which direction.
 *  A divergence above the floor is not a human error or a rule error yet:
 *  it is an ask to the owner to reconcile the two, one way or the other.
 *
 *  NO ONE IS THE ONLY BRIDGE (principle 19). Rob Cross: a few connectors
 *  carry most of the collaboration, and when they saturate everything
 *  behind them waits. A group whose answers to other groups come mostly
 *  from one person has a single point of failure with a name.
 *
 * Pure functions. The host observes (chat threads, tickets, event logs,
 * decision logs), aggregates per directed seam, and persists. Every verdict
 * carries its arithmetic or its reasons — a score that cannot say why is a
 * mood.
 */
import type { MetricSpec } from './measure';

// ── 17 · the price of a seam ────────────────────────────────────────────────

/**
 * How two groups are supposed to work together (Team Topologies).
 * `service`: one side consumes what the other provides, through a clear
 * interface; back-and-forth is friction. `collaboration`: both sides discover
 * together, back-and-forth is the work, and it must end. `facilitating`: one
 * side helps the other learn; temporary, like collaboration.
 */
export type InterfaceMode = 'service' | 'collaboration' | 'facilitating';

/** One directed seam (`from` asks, `to` answers) observed over a window. */
export interface InterfaceObservation {
  from: string;
  to: string;
  /** Declared mode; `service` when the host has not declared one. */
  mode?: InterfaceMode;
  /** For collaboration and facilitating: when the joint work is meant to end (epoch ms). */
  endsAt?: number | null;
  /** Asks `from` sent to `to` in the window. */
  asks: number;
  /** Hours to the first answer, one entry per answered ask. */
  waits: readonly number[];
  /** Subjects that went back to the asker for the same need (asked, refused, asked again). */
  loops: number;
  /** Times the asker had to chase before any answer. */
  nudges: number;
  /** Asks that ended with someone above both groups stepping in. */
  escalations: number;
}

export interface InterfacePricing {
  /** One human minute, in the host's unit. */
  costPerMinute: number;
  /** What one hour of a subject waiting costs, in the same unit. */
  delayCostPerHour: number;
  /** The wait charged to an ask nobody answered. Never zero: silence is not free. */
  unansweredHours: number;
  /** Human minutes one loop, one nudge, one escalation burns. */
  minutes: { loop: number; nudge: number; escalation: number };
}

/** $100/h people, $5 per hour a subject waits, three days for silence. */
export const DEFAULT_INTERFACE_PRICING: InterfacePricing = {
  costPerMinute: 100 / 60,
  delayCostPerHour: 5,
  unansweredHours: 72,
  minutes: { loop: 60, nudge: 15, escalation: 60 },
};

export interface InterfaceCost {
  from: string;
  to: string;
  mode: InterfaceMode;
  /** Total price of the seam over the window, in the host's unit. */
  total: number;
  /** `total / asks`: the number to compare seams with. */
  perAsk: number;
  parts: { waiting: number; silence: number; loops: number; nudges: number; escalations: number };
  asks: number;
  unansweredShare: number;
  /** Median hours to a first answer; null when nothing was answered. */
  medianWait: number | null;
  /** True when a collaboration/facilitating seam has no end date, or it has passed. */
  openEnded: boolean;
  reasons: readonly string[];
}

function assertNonNegInt(name: string, v: number): void {
  if (!Number.isInteger(v) || v < 0) throw new Error(`${name} must be a non-negative integer (got ${v})`);
}

function assertInterfacePricing(p: InterfacePricing): void {
  const values = [p.costPerMinute, p.delayCostPerHour, p.unansweredHours, p.minutes.loop, p.minutes.nudge, p.minutes.escalation];
  if (!values.every((v) => v > 0)) {
    throw new Error(
      'interface pricing must be positive: a free wait, a free minute or a free silence makes every seam look fluid — a turkey',
    );
  }
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * The price of one seam. `now` is only read for collaboration and
 * facilitating seams, to tell whether their end date has passed.
 */
export function interfaceCost(
  obs: InterfaceObservation,
  pricing: InterfacePricing = DEFAULT_INTERFACE_PRICING,
  now: number = Date.now(),
): InterfaceCost {
  assertInterfacePricing(pricing);
  for (const k of ['asks', 'loops', 'nudges', 'escalations'] as const) assertNonNegInt(k, obs[k]);
  if (obs.asks === 0) throw new Error(`seam ${obs.from} → ${obs.to} has no asks: nothing to price`);
  if (obs.waits.length > obs.asks) throw new Error(`seam ${obs.from} → ${obs.to}: more answers (${obs.waits.length}) than asks (${obs.asks})`);
  if (!obs.waits.every((w) => w >= 0)) throw new Error(`seam ${obs.from} → ${obs.to}: a wait cannot be negative`);

  const mode = obs.mode ?? 'service';
  const temporary = mode !== 'service';
  const openEnded = temporary && (obs.endsAt == null || obs.endsAt <= now);
  const unanswered = obs.asks - obs.waits.length;
  const perMin = pricing.costPerMinute;

  const parts = {
    waiting: obs.waits.reduce((a, w) => a + w, 0) * pricing.delayCostPerHour,
    silence: unanswered * pricing.unansweredHours * pricing.delayCostPerHour,
    // In a live collaboration the back-and-forth is the work, not rework.
    loops: temporary && !openEnded ? 0 : obs.loops * pricing.minutes.loop * perMin,
    nudges: obs.nudges * pricing.minutes.nudge * perMin,
    escalations: obs.escalations * pricing.minutes.escalation * perMin,
  };
  const total = parts.waiting + parts.silence + parts.loops + parts.nudges + parts.escalations;

  const reasons: string[] = [];
  const biggest = (Object.entries(parts) as [keyof typeof parts, number][]).sort((a, b) => b[1] - a[1])[0];
  if (biggest[1] > 0) reasons.push(`${biggest[0]} is ${Math.round((biggest[1] / total) * 100)}% of the price`);
  if (unanswered > 0) reasons.push(`${unanswered} of ${obs.asks} asks never answered, each charged ${pricing.unansweredHours} h of waiting`);
  if (openEnded) reasons.push(`${mode} without a live end date: priced as a service seam, loops count as rework`);
  if (reasons.length === 0) reasons.push('nothing to charge: every ask answered at once');

  return {
    from: obs.from,
    to: obs.to,
    mode,
    total,
    perAsk: total / obs.asks,
    parts,
    asks: obs.asks,
    unansweredShare: unanswered / obs.asks,
    medianWait: median(obs.waits),
    openEnded,
    reasons,
  };
}

/**
 * The metric a host tracks per seam over time, with the pricing pinned into
 * its definition. Changing the price of a minute changes what is counted:
 * principle 13 then calls the old and new readings `not_comparable`, which
 * is the point — a seam does not get cheaper by repricing its people.
 */
export function interfaceCostSpec(pricing: InterfacePricing = DEFAULT_INTERFACE_PRICING): MetricSpec {
  const m = pricing.minutes;
  return {
    id: 'interface.cost_per_ask',
    definition:
      `price of a directed seam per ask over the window: waits × ${pricing.delayCostPerHour}/h + unanswered × ${pricing.unansweredHours} h × ${pricing.delayCostPerHour}/h` +
      ` + (loops × ${m.loop} + nudges × ${m.nudge} + escalations × ${m.escalation}) min × ${round(pricing.costPerMinute)}/min; loops free in a live collaboration`,
    unit: 'host currency per ask',
    direction: 'down',
  };
}

export type InterfaceBand = 'fluid' | 'strained' | 'blocking' | 'too_early';

export interface RankedInterface extends InterfaceCost {
  band: InterfaceBand;
}

export interface RankOptions {
  /** Asks a seam needs before it gets a band at all. */
  minN: number;
}

export const DEFAULT_RANK_OPTIONS: RankOptions = { minN: 5 };

/**
 * Price every seam and band it against its peers: the costliest third per
 * ask is `blocking`, the middle third `strained`, the rest `fluid`. Bands are
 * relative on purpose (compared to what? — principle 13): an absolute
 * threshold set once is wrong for every company but the one it was set on.
 * Seams under `minN` asks are `too_early` and take no part in the thirds.
 * Sorted by total price, highest first: what costs the most, in money, is
 * what to look at first.
 */
export function rankInterfaces(
  observations: readonly InterfaceObservation[],
  pricing: InterfacePricing = DEFAULT_INTERFACE_PRICING,
  opts: RankOptions = DEFAULT_RANK_OPTIONS,
  now: number = Date.now(),
): RankedInterface[] {
  if (!(opts.minN >= 1)) throw new Error(`minN must be at least 1 (got ${opts.minN})`);
  const costs = observations.map((o) => interfaceCost(o, pricing, now));
  const judged = costs.filter((c) => c.asks >= opts.minN).map((c) => c.perAsk).sort((a, b) => a - b);
  const q1 = judged[Math.floor(judged.length / 3)];
  const q2 = judged[Math.floor((2 * judged.length) / 3)];
  return costs
    .map((c): RankedInterface => {
      if (c.asks < opts.minN || judged.length < 3) return { ...c, band: 'too_early' };
      return { ...c, band: c.perAsk >= q2 ? 'blocking' : c.perAsk >= q1 ? 'strained' : 'fluid' };
    })
    .sort((a, b) => b.total - a.total);
}

// ── 18 · the map and the territory ─────────────────────────────────────────

export interface Seam {
  from: string;
  to: string;
}

export interface Congruence {
  /** Required seams actually used / required seams, in [0, 1]. */
  score: number;
  /** Required by the process, never used: work that should flow and does not. */
  gaps: Seam[];
  /** Used, never required: the process says nothing, people route around it. */
  bypasses: Seam[];
}

const seamKey = (s: Seam): string => `${s.from}\u0000${s.to}`;

/**
 * Socio-technical congruence, directed (Cataldo, Herbsleb & Carley 2008:
 * |required ∩ actual| / |required|). `required` is the host's process map,
 * the seams its procedures depend on; `observed` is who actually asked whom.
 * A process map with no seams makes the ratio meaningless and throws.
 */
export function congruence(required: readonly Seam[], observed: readonly Seam[]): Congruence {
  const req = new Map(required.map((s) => [seamKey(s), s]));
  if (req.size === 0) throw new Error('congruence needs at least one required seam: an empty process map agrees with everything');
  const obs = new Map(observed.map((s) => [seamKey(s), s]));
  const gaps = [...req.entries()].filter(([k]) => !obs.has(k)).map(([, s]) => s);
  const bypasses = [...obs.entries()].filter(([k]) => !req.has(k)).map(([, s]) => s);
  return { score: (req.size - gaps.length) / req.size, gaps, bypasses };
}

/** One case decided twice: once by the rule, once by a person. */
export interface DecisionPair {
  rule: string;
  human: string;
}

export interface DivergencePolicy {
  /** Cases needed before the rate means anything. */
  minN: number;
  /** Above this share of disagreements, the owner must reconcile. */
  maxRate: number;
  /**
   * Decisions from most permissive to strictest (e.g. accept, hold, refuse).
   * When given, disagreements are split into the person being looser or
   * stricter than the rule; decisions outside the list are `unordered`.
   */
  strictness?: readonly string[];
}

/** Twenty cases, and the rule and the people disagree on at most one in ten. */
export const DEFAULT_DIVERGENCE_POLICY: DivergencePolicy = { minN: 20, maxRate: 0.1 };

export type DivergenceVerdict =
  | { status: 'too_early'; n: number; rate: null; reasons: readonly string[] }
  | {
      status: 'aligned' | 'diverging';
      n: number;
      rate: number;
      looser: number;
      stricter: number;
      unordered: number;
      reasons: readonly string[];
    };

/**
 * How often a rule and the people applying it decide the same case
 * differently. `diverging` does not say who is wrong: it says the rule and
 * the guide no longer describe the same company, and someone must make them
 * agree before the gap teaches each side to ignore the other.
 */
export function divergence(pairs: readonly DecisionPair[], policy: DivergencePolicy = DEFAULT_DIVERGENCE_POLICY): DivergenceVerdict {
  if (!(policy.minN >= 1) || !(policy.maxRate > 0) || policy.maxRate >= 1) {
    throw new Error(
      `divergence policy needs minN >= 1 and 0 < maxRate < 1 (got minN=${policy.minN}, maxRate=${policy.maxRate}): a ceiling of zero flags every human judgement, a ceiling of one flags none`,
    );
  }
  const n = pairs.length;
  if (n < policy.minN) return { status: 'too_early', n, rate: null, reasons: [`n=${n} < ${policy.minN}: an anecdote, not a divergence`] };

  let looser = 0;
  let stricter = 0;
  let unordered = 0;
  const rank = new Map((policy.strictness ?? []).map((d, i) => [d, i]));
  for (const p of pairs) {
    if (p.rule === p.human) continue;
    const r = rank.get(p.rule);
    const h = rank.get(p.human);
    if (r === undefined || h === undefined) unordered++;
    else if (h < r) looser++;
    else stricter++;
  }
  const disagreements = looser + stricter + unordered;
  const rate = disagreements / n;
  const status = rate > policy.maxRate ? 'diverging' : 'aligned';
  const reasons = [`rule and people disagree on ${disagreements} of ${n} cases (${pct(rate)}, ceiling ${pct(policy.maxRate)})`];
  if (looser + stricter > 0) reasons.push(`people looser than the rule ${looser} times, stricter ${stricter} times`);
  if (status === 'diverging') reasons.push('reconcile: change the rule or change the guide, then measure again under the new version');
  return { status, n, rate, looser, stricter, unordered, reasons };
}

// ── 19 · no one is the only bridge ─────────────────────────────────────────

/** Answers one person gave to OTHER groups over the window. */
export interface BridgeCount {
  actor: string;
  group: string;
  answers: number;
}

export interface BridgePolicy {
  /** Cross-group answers a group needs before its concentration means anything. */
  minN: number;
  /** Above this share, the top person is a single point of failure. */
  maxShare: number;
}

/** Twenty answers, and nobody carries more than half of their group's. */
export const DEFAULT_BRIDGE_POLICY: BridgePolicy = { minN: 20, maxShare: 0.5 };

export interface BridgeLoad {
  group: string;
  /** Cross-group answers the group gave. */
  n: number;
  top: { actor: string; answers: number; share: number };
  status: 'too_early' | 'spread' | 'single_bridge';
}

/**
 * For each group, how much of what it gives other groups comes from its
 * busiest person. Sorted with single bridges first, then by share. A group
 * whose one bridge goes on holiday stops answering the rest of the company;
 * this names that person before the holiday does.
 */
export function bridgeLoad(counts: readonly BridgeCount[], policy: BridgePolicy = DEFAULT_BRIDGE_POLICY): BridgeLoad[] {
  if (!(policy.minN >= 1) || !(policy.maxShare > 0) || policy.maxShare >= 1) {
    throw new Error(
      `bridge policy needs minN >= 1 and 0 < maxShare < 1 (got minN=${policy.minN}, maxShare=${policy.maxShare}): a share of one never flags anyone`,
    );
  }
  const byGroup = new Map<string, Map<string, number>>();
  for (const c of counts) {
    assertNonNegInt('answers', c.answers);
    const g = byGroup.get(c.group) ?? new Map<string, number>();
    g.set(c.actor, (g.get(c.actor) ?? 0) + c.answers);
    byGroup.set(c.group, g);
  }
  const out: BridgeLoad[] = [];
  for (const [group, actors] of byGroup) {
    const n = [...actors.values()].reduce((a, v) => a + v, 0);
    if (n === 0) continue;
    const [actor, answers] = [...actors.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const share = answers / n;
    const status = n < policy.minN ? 'too_early' : share > policy.maxShare ? 'single_bridge' : 'spread';
    out.push({ group, n, top: { actor, answers, share }, status });
  }
  const order = { single_bridge: 0, spread: 1, too_early: 2 } as const;
  return out.sort((a, b) => order[a.status] - order[b.status] || b.top.share - a.top.share);
}

const round = (n: number): number => Math.round(n * 100) / 100;
const pct = (r: number): string => `${Math.round(r * 100)}%`;
