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
    if (outcome === 'failure') r.failures++;
  }

  /** A human said "this needed me". Instant, sticky demotion. */
  contestUp(kind: string): void {
    const r = this.get(kind);
    r.contestsUp++;
    r.demotedUntilReset = true;
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
    if (r.demotedUntilReset) return derived;
    if (derived === 0) return 0;
    if (!this.promotionReady(kind)) return derived;
    return (derived - 1) as Tier;
  }

  promotionReady(kind: string): boolean {
    const r = this.records.get(kind);
    if (!r || r.executions < this.opts.minTrack) return false;
    const bad = r.failures + r.contestsUp;
    return bad / r.executions <= this.opts.errorBudget;
  }

  /** Clear a sticky demotion after a human review. Deliberate act only. */
  reset(kind: string): void {
    const r = this.records.get(kind);
    if (r) {
      r.demotedUntilReset = false;
      r.executions = 0;
      r.failures = 0;
    }
  }

  snapshot(kind: string): Readonly<KindRecord> {
    return { ...(this.records.get(kind) ?? EMPTY) };
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
