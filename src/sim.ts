/**
 * subsidium · closed-world simulation harness
 *
 * Free, seeded, deterministic — the sibling repo's rule: test your
 * orchestration logic before spending a cent (here: before spending a
 * minute of a human's attention or a merchant's patience).
 *
 * The harness runs the REAL primitives (deriveTier, TierGovernor, the
 * thread state machine) inside a synthetic world with known ground truth,
 * and compares policies:
 *
 *  GATING — who is allowed to fire an action?
 *   · all_auto          the 2023 agent: everything fires immediately
 *   · all_consent       the cautious default: everything waits for a click
 *   · pyramid           derived tiers, veto lane, consent lane
 *   · pyramid_governor  pyramid + learned promotion / cliff demotion
 *
 *  OUTREACH — how do you talk to a human who does not answer?
 *   · naive             same channel, same message, until a cap
 *   · law               the thread law: nudge ×1, reframe, reframe, close
 *
 * What a closed world CAN prove: that the laws produce the ordering they
 * promise under stated assumptions (throughput, incidents, attention,
 * social cost), and that the mechanics hold under drift. What it CANNOT
 * prove: the assumptions themselves. Production measurement keeps the
 * final word — a simulation win is a license to run the real experiment,
 * never a substitute for it.
 */
import { TierGovernor, type GovernorOptions } from './governor';
import { deriveTier } from './tier';
import { nextMove, transition } from './thread';
import type { Domain, ThreadState } from './types';

// ── deterministic rng ────────────────────────────────────────────────────────

export interface SimRng {
  /** Uniform in [0, 1). Same seed, same sequence, on every machine. */
  next(): number;
}

/** Plain LCG — not cryptographic, exactly reproducible, dependency-free. */
export function lcg(seed: number): SimRng {
  let s = seed >>> 0 || 1;
  return {
    next() {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    },
  };
}

// ── gating simulation ────────────────────────────────────────────────────────

export type GatingPolicy = 'all_auto' | 'all_consent' | 'pyramid' | 'pyramid_governor';

export interface GatingKind {
  kind: string;
  reversible: boolean;
  externallyVisible: boolean;
  domain: Domain;
  /** Ground truth: P(a proposed action of this kind is the right thing to do). */
  goodRate: number;
  /** Ground truth: P(the subject unblocks | a good action fired). */
  unblockRate: number;
  /** Proposals of this kind arriving per simulated day. */
  perDay: number;
}

export interface GatingHuman {
  minutesPerDay: number;
  /** Read + decide one consent item. */
  minutesPerConsent: number;
  /** Scan one veto item — cheaper than a decision by design. */
  minutesPerVetoScan: number;
  /** P(the human classifies an item correctly). Humans are not oracles. */
  accuracy: number;
  /**
   * P(the human notices a bad PROMOTED fire and contests it — "this needed
   * me"). Defaults to `accuracy`. Set to 0 for the ablation that measures
   * what the cliff is worth: promotion without demotion.
   */
  contestRate?: number;
}

export interface GatingConfig {
  days: number;
  seed: number;
  kinds: GatingKind[];
  human: GatingHuman;
  /** Optional regime change: from `day` on, `kind` proposes good actions at `goodRate`. */
  drift?: { day: number; kind: string; goodRate: number };
  governor?: GovernorOptions;
}

export interface GatingResult {
  policy: GatingPolicy;
  /** Actions that actually fired. */
  fired: number;
  /** Subjects unblocked — the only number the main rule cares about. */
  unblocked: number;
  /** BAD actions that fired while irreversible AND externally visible. */
  incidents: number;
  /** Bad actions fired, any kind. */
  badFired: number;
  /** Stopped by the human: consent rejections + veto objections. */
  stopped: number;
  humanMinutes: number;
  /** Consent items still waiting at the horizon. */
  queuedEnd: number;
  /** Mean days between a proposal's birth and its firing. */
  avgWaitDays: number;
  /** unblocked per human HOUR — throughput of the scarce resource. */
  unblockedPerHour: number;
}

interface Item {
  kindIx: number;
  good: boolean;
  bornDay: number;
  /** Consent cost multiplier: T4 files take longer to read than T3 clicks. */
  costX: number;
  /** Routed below its derived tier — decided ONCE, at routing time. */
  promoted: boolean;
}

/**
 * One run of one policy over one seeded world.
 *
 * Daily order of operations, documented because it IS the model:
 *  1. drift applies (the world changes before anyone acts);
 *  2. proposals arrive and are routed by the policy;
 *  3. the human scans the veto lane FIRST (cheap and time-boxed: items whose
 *     window closed today fire on silence), then works the consent queue,
 *     oldest first, until the day's minutes run out.
 */
export function simulateGating(policy: GatingPolicy, cfg: GatingConfig): GatingResult {
  const rng = lcg(cfg.seed);
  const goodRates = cfg.kinds.map((k) => k.goodRate);
  const gov = new TierGovernor(cfg.governor);
  const consentQ: Item[] = [];
  let vetoLane: Item[] = [];

  let fired = 0;
  let unblocked = 0;
  let incidents = 0;
  let badFired = 0;
  let stopped = 0;
  let humanMinutes = 0;
  let waitSum = 0;

  const isGoverned = policy === 'pyramid_governor';
  const contestRate = cfg.human.contestRate ?? cfg.human.accuracy;

  const fire = (it: Item, day: number): void => {
    fired++;
    waitSum += day - it.bornDay;
    const k = cfg.kinds[it.kindIx];
    if (isGoverned) gov.record(k.kind, it.good ? 'success' : 'failure');
    if (it.good) {
      if (rng.next() < k.unblockRate) unblocked++;
      return;
    }
    badFired++;
    if (!k.reversible && k.externallyVisible) incidents++;
    // A bad action that fired from a PROMOTED tier is exactly what the human
    // notices after the fact — "this needed me".
    if (isGoverned && it.promoted && rng.next() < contestRate) gov.contestUp(k.kind);
  };

  for (let day = 0; day < cfg.days; day++) {
    if (cfg.drift && day === cfg.drift.day) {
      goodRates[cfg.kinds.findIndex((k) => k.kind === cfg.drift?.kind)] = cfg.drift.goodRate;
    }

    // 2 · arrivals, routed
    const newVeto: Item[] = [];
    cfg.kinds.forEach((k, kindIx) => {
      for (let i = 0; i < k.perDay; i++) {
        const it: Item = { kindIx, good: rng.next() < goodRates[kindIx], bornDay: day, costX: 1, promoted: false };
        if (policy === 'all_auto') {
          fire(it, day);
          continue;
        }
        if (policy === 'all_consent') {
          consentQ.push(it);
          continue;
        }
        const derived = deriveTier({
          reversible: k.reversible,
          externallyVisible: k.externallyVisible,
          domain: k.domain,
        }).tier;
        const tier = isGoverned ? gov.effectiveTier(k.kind, derived) : derived;
        it.promoted = tier < derived;
        if (tier <= 1) fire(it, day);
        else if (tier === 2) newVeto.push(it);
        else {
          it.costX = tier === 4 ? 2 : 1;
          consentQ.push(it);
        }
      }
    });

    // 3 · the human's day
    let minutes = cfg.human.minutesPerDay;

    // veto lane: yesterday's items close their window today. Scanned + judged
    // bad → objection. Everything not scanned fires on silence — that is what
    // a veto IS, and it is why the scan is priced cheap.
    for (const it of vetoLane) {
      const k = cfg.kinds[it.kindIx];
      if (minutes >= cfg.human.minutesPerVetoScan) {
        minutes -= cfg.human.minutesPerVetoScan;
        humanMinutes += cfg.human.minutesPerVetoScan;
        const judgedBad = rng.next() < cfg.human.accuracy ? !it.good : it.good;
        if (judgedBad) {
          stopped++;
          if (isGoverned) gov.record(k.kind, 'failure');
          continue;
        }
      }
      fire(it, day);
    }
    vetoLane = newVeto;

    // consent queue, oldest first, until the minutes run out
    while (consentQ.length > 0 && minutes >= cfg.human.minutesPerConsent * consentQ[0].costX) {
      const it = consentQ.shift() as Item;
      const cost = cfg.human.minutesPerConsent * it.costX;
      minutes -= cost;
      humanMinutes += cost;
      const judgedGood = rng.next() < cfg.human.accuracy ? it.good : !it.good;
      if (judgedGood) fire(it, day);
      else {
        stopped++;
        if (isGoverned) gov.record(cfg.kinds[it.kindIx].kind, 'failure');
      }
    }
  }

  return {
    policy,
    fired,
    unblocked,
    incidents,
    badFired,
    stopped,
    humanMinutes,
    queuedEnd: consentQ.length + vetoLane.length,
    avgWaitDays: fired > 0 ? Math.round((waitSum / fired) * 100) / 100 : 0,
    unblockedPerHour: humanMinutes > 0 ? Math.round((unblocked / (humanMinutes / 60)) * 100) / 100 : Number.POSITIVE_INFINITY,
  };
}

// ── outreach simulation ──────────────────────────────────────────────────────

export type OutreachPolicy = 'naive' | 'law';

export interface OutreachConfig {
  seed: number;
  counterparts: number;
  /** Number of channels available (the law explores one per frame). */
  channels: number;
  /** Response probability on the counterpart's (hidden) preferred channel. */
  bestChannelRate: number;
  /** Response probability elsewhere. */
  otherChannelRate: number;
  /** Messages on the SAME frame beyond this many make the counterpart hostile. */
  annoyanceThreshold: number;
  /** The naive policy's message cap per counterpart. */
  naiveCap: number;
}

export interface OutreachResult {
  policy: OutreachPolicy;
  replies: number;
  messagesSent: number;
  /** Messages sent past a counterpart's annoyance threshold — social damage. */
  annoyanceEvents: number;
  /** Threads closed without a reply (the law's honest exit). */
  closed: number;
}

/**
 * One counterpart at a time: a hidden preferred channel, a patience budget.
 * The naive policy hammers channel 0. The law policy drives the REAL thread
 * state machine: one nudge per frame, a reframe changes channel, three
 * frames then close.
 */
export function simulateOutreach(policy: OutreachPolicy, cfg: OutreachConfig): OutreachResult {
  const rng = lcg(cfg.seed);
  let replies = 0;
  let messagesSent = 0;
  let annoyanceEvents = 0;
  let closed = 0;

  for (let c = 0; c < cfg.counterparts; c++) {
    const best = Math.floor(rng.next() * cfg.channels);
    let hostile = false;

    const send = (channel: number, sameFrameCount: number): boolean => {
      messagesSent++;
      if (sameFrameCount > cfg.annoyanceThreshold) {
        annoyanceEvents++;
        hostile = true;
      }
      if (hostile) return false;
      const p = channel === best ? cfg.bestChannelRate : cfg.otherChannelRate;
      return rng.next() < p;
    };

    if (policy === 'naive') {
      let got = false;
      for (let m = 1; m <= cfg.naiveCap && !got; m++) {
        got = send(0, m);
      }
      if (got) replies++;
      continue;
    }

    // law: the real state machine decides every move. The loop runs only
    // while the thread awaits a reply — nextMove can therefore never answer
    // 'wait' here, so the switch needs no case for it.
    let state: ThreadState = { status: 'awaiting_reply', nudgesSinceReply: 0, framesTried: 0 };
    while (state.status === 'awaiting_reply') {
      const move = nextMove(state);
      switch (move.move) {
        case 'nudge': {
          const channel = state.framesTried % cfg.channels;
          state = transition(state, { kind: 'nudged' });
          if (send(channel, state.nudgesSinceReply)) {
            replies++;
            state = transition(state, { kind: 'counterpart_replied' });
          }
          break;
        }
        case 'reframe':
          state = transition(state, { kind: 'reframed' });
          break;
        case 'close':
          state = transition(state, { kind: 'closed' });
          closed++;
          break;
      }
    }
  }

  return { policy, replies, messagesSent, annoyanceEvents, closed };
}

// ── multi-seed aggregation ───────────────────────────────────────────────────

/** Average a numeric field across seeds — the report never quotes a single run. */
export function averageGating(
  policy: GatingPolicy,
  cfg: Omit<GatingConfig, 'seed'>,
  seeds: readonly number[],
): GatingResult {
  const runs = seeds.map((seed) => simulateGating(policy, { ...cfg, seed }));
  const avg = (f: (r: GatingResult) => number): number =>
    Math.round((runs.reduce((s, r) => s + f(r), 0) / runs.length) * 100) / 100;
  return {
    policy,
    fired: avg((r) => r.fired),
    unblocked: avg((r) => r.unblocked),
    incidents: avg((r) => r.incidents),
    badFired: avg((r) => r.badFired),
    stopped: avg((r) => r.stopped),
    humanMinutes: avg((r) => r.humanMinutes),
    queuedEnd: avg((r) => r.queuedEnd),
    avgWaitDays: avg((r) => r.avgWaitDays),
    unblockedPerHour: avg((r) => (Number.isFinite(r.unblockedPerHour) ? r.unblockedPerHour : 0)),
  };
}

/** A world close to the one this framework was extracted from. */
export function defaultWorld(): Omit<GatingConfig, 'seed'> {
  return {
    days: 60,
    kinds: [
      // recompute a score: reversible, internal, a rule applies → T0
      { kind: 'recompute_score', reversible: true, externallyVisible: false, domain: 'clear', goodRate: 0.98, unblockRate: 0.02, perDay: 6 },
      // refresh provisioning state: reversible, internal, needs judgment → T1
      { kind: 'refresh_state', reversible: true, externallyVisible: false, domain: 'complicated', goodRate: 0.95, unblockRate: 0.05, perDay: 4 },
      // internal escalation to the team: irreversible, internal → T2
      { kind: 'escalate_team', reversible: false, externallyVisible: false, domain: 'complicated', goodRate: 0.85, unblockRate: 0.3, perDay: 4 },
      // merchant message: irreversible, visible outside → T3
      { kind: 'merchant_message', reversible: false, externallyVisible: true, domain: 'complicated', goodRate: 0.8, unblockRate: 0.25, perDay: 5 },
      // underwriting judgment call: complex → T4
      { kind: 'underwriting_call', reversible: false, externallyVisible: true, domain: 'complex', goodRate: 0.6, unblockRate: 0.5, perDay: 1 },
    ],
    human: { minutesPerDay: 60, minutesPerConsent: 5, minutesPerVetoScan: 1, accuracy: 0.9 },
  };
}
