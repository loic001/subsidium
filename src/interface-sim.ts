/**
 * subsidium · closed world for the interface laws (principles 17, 18, 19)
 *
 * Same contract as sim.ts: seeded, deterministic, assumptions written down,
 * orderings pinned by tests. Each world asks the question its principle
 * answers, and the price is the gap between obeying and ignoring the law.
 *
 *  17 — a team can repair two seams a week. Which two? Ranked by how much a
 *       seam talks, by its price with silence free, or by its full price.
 *  18 — the guide drifts from the rule now and then. Watch the divergence and
 *       reconcile over the ceiling, or never look.
 *  19 — people take a week off now and then. A group whose answers ride on
 *       one person waits for that person; a flagged group spreads the load.
 *
 * The worlds are deliberately small and their knobs are in the defaults
 * below. Change them, run `npm run sim`, and the report says whether the
 * ordering survives your world. Production keeps the final word.
 */
import { bridgeLoad, divergence, interfaceCost, DEFAULT_INTERFACE_PRICING, type InterfaceObservation, type InterfacePricing } from './interface';
import { lcg, type SimRng } from './sim';

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Exponential draw with the given mean. */
function exp(rng: SimRng, mean: number): number {
  return -Math.log(1 - rng.next()) * mean;
}

// ── 17 · which seams to repair ──────────────────────────────────────────────

export type RepairPolicy = 'none' | 'by_volume' | 'by_price_silence_free' | 'by_price';

export interface SeamWorld {
  seams: number;
  weeks: number;
  /** Seams a team can repair per week. */
  repairsPerWeek: number;
  /** Share of waits, silences and loops a repair removes for good. */
  repairEffect: number;
}

export interface RepairResult {
  /** True price of every seam over the whole run, default pricing. */
  totalCost: number;
  /** Price avoided against doing nothing, same seed. */
  saved: number;
}

interface SeamTruth {
  asks: number;
  answerRate: number;
  waitMean: number;
  loopRate: number;
  repaired: boolean;
}

/**
 * The world's assumption, stated: the seams that talk the most are the
 * best-staffed ones (fast answers), and the expensive ones are quieter and
 * slower, with more silence. That is what the reference host measured; if
 * your company is the opposite, ranking by volume will look better here.
 */
function seamWorld(rng: SimRng, n: number): SeamTruth[] {
  const out: SeamTruth[] = [];
  for (let i = 0; i < n; i++) {
    const busy = rng.next();
    out.push({
      asks: Math.max(2, Math.round(4 + busy * busy * 60)),
      answerRate: 0.45 + 0.5 * busy + 0.05 * rng.next(),
      waitMean: 2 + (1 - busy) * 40 * rng.next(),
      loopRate: 0.05 + 0.3 * rng.next(),
      repaired: false,
    });
  }
  return out;
}

function observe(rng: SimRng, s: SeamTruth, effect: number): InterfaceObservation {
  const keep = s.repaired ? 1 - effect : 1;
  const waits: number[] = [];
  let loops = 0;
  for (let k = 0; k < s.asks; k++) {
    const answered = rng.next() < 1 - (1 - s.answerRate) * keep;
    if (answered) waits.push(exp(rng, s.waitMean * keep));
    if (rng.next() < s.loopRate * keep) loops++;
  }
  return { from: 'a', to: 'b', asks: s.asks, waits, loops, nudges: 0, escalations: 0 };
}

export function simulateRepair(policy: RepairPolicy, world: SeamWorld, seed: number): RepairResult {
  const run = (p: RepairPolicy): number => {
    const rng = lcg(seed);
    const seams = seamWorld(rng, world.seams);
    const silenceFree: InterfacePricing = { ...DEFAULT_INTERFACE_PRICING, unansweredHours: 1e-6 };
    let total = 0;
    for (let w = 0; w < world.weeks; w++) {
      const obs = seams.map((s) => observe(rng, s, world.repairEffect));
      total += obs.reduce((a, o) => a + interfaceCost(o, DEFAULT_INTERFACE_PRICING, 0).total, 0);
      if (p === 'none') continue;
      const score = (o: InterfaceObservation): number =>
        p === 'by_volume' ? o.asks : interfaceCost(o, p === 'by_price' ? DEFAULT_INTERFACE_PRICING : silenceFree, 0).total;
      const candidates = seams.map((s, i) => ({ i, v: score(obs[i]) })).filter((c) => !seams[c.i].repaired);
      candidates.sort((x, y) => y.v - x.v);
      for (const c of candidates.slice(0, world.repairsPerWeek)) seams[c.i].repaired = true;
    }
    return total;
  };
  const totalCost = run(policy);
  return { totalCost: Math.round(totalCost), saved: Math.round(run('none') - totalCost) };
}

export function defaultSeamWorld(): SeamWorld {
  return { seams: 24, weeks: 12, repairsPerWeek: 1, repairEffect: 0.6 };
}

// ── 18 · reconcile the rule and the guide ──────────────────────────────────

export type ReconcilePolicy = 'blind' | 'watch';

export interface DriftWorld {
  weeks: number;
  /** Cases a person decides per week. */
  casesPerWeek: number;
  /** Chance per week that the guide starts drifting from the rule. */
  driftChance: number;
  /** Share of cases a drifted guide decides differently from the rule. */
  driftShare: number;
  /** Honest human judgement: disagreement even with no drift. */
  noise: number;
}

export interface ReconcileResult {
  /** Cases the rule and the person decided differently because of drift. */
  driftedDecisions: number;
  reconciliations: number;
  /** Reconciliations triggered while no drift was live (noise alone). */
  falseAlarms: number;
}

export function simulateReconcile(policy: ReconcilePolicy, world: DriftWorld, seed: number): ReconcileResult {
  const rng = lcg(seed);
  let drifted = false;
  let driftedDecisions = 0;
  let reconciliations = 0;
  let falseAlarms = 0;
  let window: { rule: string; human: string }[] = [];
  for (let w = 0; w < world.weeks; w++) {
    if (!drifted && rng.next() < world.driftChance) drifted = true;
    for (let c = 0; c < world.casesPerWeek; c++) {
      const drift = drifted && rng.next() < world.driftShare;
      const noisy = rng.next() < world.noise;
      if (drift) driftedDecisions++;
      window.push({ rule: 'accept', human: drift || noisy ? 'refuse' : 'accept' });
    }
    if (policy === 'watch') {
      window = window.slice(-world.casesPerWeek * 2);
      if (divergence(window).status === 'diverging') {
        reconciliations++;
        if (!drifted) falseAlarms++;
        drifted = false;
        window = [];
      }
    }
  }
  return { driftedDecisions, reconciliations, falseAlarms };
}

export function defaultDriftWorld(): DriftWorld {
  return { weeks: 26, casesPerWeek: 40, driftChance: 0.12, driftShare: 0.3, noise: 0.03 };
}

// ── 19 · spread the bridge ─────────────────────────────────────────────────

export type BridgeSimPolicy = 'ignore' | 'spread';

export interface BridgeWorld {
  weeks: number;
  people: number;
  asksPerWeek: number;
  /** Share of answers the busiest person starts with. */
  topShare: number;
  /** Chance per person per week of being away the whole week. */
  absence: number;
  /** Hours an ask waits when its person is away and nobody can cover. */
  waitWhenAway: number;
  /**
   * The world's assumption, stated: a colleague can cover an ask only if
   * they already carry at least this share of the group's answers (they know
   * the subject). Spreading the load is what makes cover possible.
   */
  coverShare: number;
}

export interface BridgeResult {
  /** Hours asks spent waiting for someone who was away. */
  waitHours: number;
  /** Weeks the group was flagged as hanging on one person. */
  flaggedWeeks: number;
}

export function simulateBridge(policy: BridgeSimPolicy, world: BridgeWorld, seed: number): BridgeResult {
  const rng = lcg(seed);
  const rest = (1 - world.topShare) / (world.people - 1);
  let shares = [world.topShare, ...Array(world.people - 1).fill(rest)];
  let waitHours = 0;
  let flaggedWeeks = 0;
  for (let w = 0; w < world.weeks; w++) {
    const away = shares.map(() => rng.next() < world.absence);
    const answers = shares.map(() => 0);
    for (let a = 0; a < world.asksPerWeek; a++) {
      let r = rng.next();
      let who = 0;
      while (who < shares.length - 1 && r >= shares[who]) r -= shares[who++];
      if (away[who]) {
        const cover = shares.findIndex((sh, i) => i !== who && !away[i] && sh >= world.coverShare);
        if (cover === -1) waitHours += world.waitWhenAway;
        else who = cover;
      }
      answers[who]++;
    }
    const load = bridgeLoad(answers.map((n, i) => ({ actor: `p${i}`, group: 'g', answers: n })));
    if (load[0].status === 'single_bridge') {
      flaggedWeeks++;
      if (policy === 'spread') shares = shares.map(() => 1 / world.people);
    }
  }
  return { waitHours: round1(waitHours), flaggedWeeks };
}

export function defaultBridgeWorld(): BridgeWorld {
  return { weeks: 26, people: 5, asksPerWeek: 40, topShare: 0.9, absence: 0.1, waitWhenAway: 40, coverShare: 0.15 };
}

/** Mean of a numeric result over several seeds, field by field. */
export function averageOver<T extends object>(f: (seed: number) => T, seeds: readonly number[]): T {
  const runs = seeds.map(f) as unknown as Record<string, number>[];
  const out: Record<string, number> = {};
  for (const k of Object.keys(runs[0])) out[k] = round1(runs.reduce((a, r) => a + r[k], 0) / runs.length);
  return out as unknown as T;
}
