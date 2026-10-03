/**
 * subsidium · tier governor
 *
 * Learned trust decides how much autonomy an action KIND deserves —
 * thresholds are learned, never hardcoded per task (panarchy-llm's wave
 * governor, transposed from sampling budgets to autonomy budgets).
 *
 * Two movements, asymmetric on purpose:
 *
 *  PROMOTION (down the pyramid, more autonomy) is slow and earned:
 *  an action kind may run one tier below its derived tier only after
 *  `minTrack` executions with a failure rate under the error budget.
 *  This is the Kubernetes operator lesson: Deep Insights (level 4) comes
 *  BEFORE Auto Pilot (level 5). No measurement, no autonomy.
 *
 *  DEMOTION (up the pyramid, less autonomy) is instant and cheap:
 *  one human contest ("this needed me") or a failure-rate breach snaps the
 *  kind back to its derived tier. Cynefin's catastrophic fold — clear falls
 *  straight into chaotic through complacency — means the way up must be a
 *  cliff, not a staircase.
 *
 *  The human contest in the other direction ("this did NOT need me") is the
 *  yellow card (EU early-warning mechanism): it does not approve anything,
 *  it contests the TIER, and it is the learning signal that moves kinds
 *  down over time. You reach 90% autonomy empirically, case by case —
 *  never by reclassifying what gets counted.
 */
import type { Tier } from './types';

export interface GovernorOptions {
  /** Executions required before a promotion can even be considered. */
  minTrack: number;
  /** Max tolerated failure+contest rate on the track record (0..1). */
  errorBudget: number;
  /**
   * How a kind recovers after a human contest or a failure.
   *
   *  - `manual` (default): the demotion is sticky until a deliberate reset().
   *  - `streak`: trust re-earns by itself. A kind is promoted after
   *    `minTrack` CONSECUTIVE clean executions, and one contest or failure
   *    puts the streak back to zero. No reset needed, no lifetime rate.
   *
   * `manual` assumes someone holds the autonomy review. Measured on a host
   * with one founder approving everything (2026-10): 7 kinds out of 9 sat
   * demoted for weeks because nobody ran the review, so nothing could ever
   * promote and the consent queue expired faster than it was read. A cliff
   * with no way back up is a turkey; `streak` keeps the cliff and adds the
   * staircase.
   */
  healing?: 'manual' | 'streak';
}

export const DEFAULT_GOVERNOR_OPTIONS: GovernorOptions = {
  minTrack: 20,
  errorBudget: 0.05,
};

export interface KindRecord {
  executions: number;
  failures: number;
  /** "This needed a human" contests — instant demotion. */
  contestsUp: number;
  /** "This did not need me" yellow cards — evidence for promotion. */
  contestsDown: number;
  demotedUntilReset: boolean;
  /** Consecutive clean executions since the last failure or contest (`streak` healing). */
  streak?: number;
}

const EMPTY: KindRecord = {
  executions: 0,
  failures: 0,
  contestsUp: 0,
  contestsDown: 0,
  demotedUntilReset: false,
};

export class TierGovernor {
  private records = new Map<string, KindRecord>();

  constructor(private readonly opts: GovernorOptions = DEFAULT_GOVERNOR_OPTIONS) {}

  record(kind: string, outcome: 'success' | 'failure'): void {
    const r = this.get(kind);
    r.executions++;
    if (outcome === 'failure') {
      r.failures++;
      r.streak = 0;
    } else {
      r.streak = (r.streak ?? 0) + 1;
    }
  }

  /** A human said "this needed me". Instant, sticky demotion. */
  contestUp(kind: string): void {
    const r = this.get(kind);
    r.contestsUp++;
    r.demotedUntilReset = true;
    r.streak = 0;
  }

  /** A human said "this did not need me" — the yellow card. */
  contestDown(kind: string): void {
    this.get(kind).contestsDown++;
  }

  /**
   * The tier this kind runs at TODAY, given its derived tier.
   * At most ONE tier of promotion below the derived tier: trust is earned
   * a step at a time, and T3→T0 in one move is how turkeys are farmed.
   */
  effectiveTier(kind: string, derived: Tier): Tier {
    const r = this.records.get(kind) ?? EMPTY;
    if (r.demotedUntilReset && !this.streakHealing) return derived;
    if (derived === 0) return 0;
    if (!this.promotionReady(kind)) return derived;
    return (derived - 1) as Tier;
  }

  private get streakHealing(): boolean {
    return this.opts.healing === 'streak';
  }

  promotionReady(kind: string): boolean {
    const r = this.records.get(kind);
    // Streak healing: only the run since the last incident counts. A record
    // written before `streak` existed has none, and starts from zero.
    if (this.streakHealing) return (r?.streak ?? 0) >= this.opts.minTrack;
    if (!r || r.executions < this.opts.minTrack) return false;
    const bad = r.failures + r.contestsUp;
    return bad / r.executions <= this.opts.errorBudget;
  }

  /**
   * Clear a sticky demotion after a human review. Deliberate act only.
   *
   * The contest is an ALARM, not a criminal record: its job was to force
   * this review, and the review's verdict replaces it — so it is cleared
   * with the track. Keeping contests forever makes every promotion bar
   * ~20× higher per alarm, and at the horizon every kind freezes at its
   * derived tier: a reset() that cannot re-arm is a turkey. The real
   * protection stays: trust re-earns from ZERO track, a step at a time.
   */
  reset(kind: string): void {
    const r = this.records.get(kind);
    if (r) {
      r.demotedUntilReset = false;
      r.executions = 0;
      r.failures = 0;
      r.contestsUp = 0;
      r.streak = 0;
    }
  }

  snapshot(kind: string): Readonly<KindRecord> {
    return { ...(this.records.get(kind) ?? EMPTY) };
  }

  /**
   * Persist / restore. A host that cannot dump the ledger cannot run the
   * governor in production — it would reset to "no track" on every boot
   * and never promote. Other entrepreneurs need this; in-memory only is a turkey.
   */
  dump(): Record<string, KindRecord> {
    const out: Record<string, KindRecord> = {};
    for (const [kind, rec] of this.records) out[kind] = { ...rec };
    return out;
  }

  hydrate(records: Record<string, KindRecord>): void {
    this.records.clear();
    for (const [kind, rec] of Object.entries(records)) {
      this.records.set(kind, {
        executions: rec.executions ?? 0,
        failures: rec.failures ?? 0,
        contestsUp: rec.contestsUp ?? 0,
        contestsDown: rec.contestsDown ?? 0,
        demotedUntilReset: rec.demotedUntilReset ?? false,
        streak: rec.streak ?? 0,
      });
    }
  }

  private get(kind: string): KindRecord {
    let r = this.records.get(kind);
    if (!r) {
      r = { ...EMPTY };
      this.records.set(kind, r);
    }
    return r;
  }
}
