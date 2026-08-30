/**
 * subsidium · SOP — a procedure is a first-class citizen
 *
 * "Optimize the company" decomposes into procedures: named, versioned
 * sequences of actions that a human approved ONCE and the system may then
 * run under the pyramid's gates. Three laws, each blocking a real failure:
 *
 *  WEAKEST-LINK TIER — a chain is as dangerous as its most dangerous link.
 *  The SOP's tier is the MAX of its steps' derived tiers, never an average
 *  and never a separate declaration: declaring "this procedure is safe"
 *  while one step emails a merchant is how safe-sounding names ship
 *  irreversible actions.
 *
 *  APPROVAL FOLLOWS VERIFICATION — the lifecycle is a one-way ladder
 *  (draft → verified → approved) and any EDIT falls back to draft. A human
 *  approves a text they read; if the text changed, that approval is void.
 *
 *  TRUST BELONGS TO THE VERSION — the governor key includes the version,
 *  so an edited SOP re-earns its autonomy from zero track. Otherwise
 *  editing a trusted procedure inherits trust it never earned (the same
 *  door Goodhart uses: keep the name, change what it does).
 */
import { deriveTier, type TierInput } from './tier';
import type { TierVerdict } from './types';

/** One link of the chain. `input` = `tierInput(action, channel)` of the underlying action. */
export interface SopStep {
  /** Kind of the action executed at this step. */
  actionKind: string;
  /** What the step does, in the host's language. */
  title: string;
  input: TierInput;
}

export interface SopSpec {
  id: string;
  /** Bump on ANY edit of steps or intent — trust is keyed on it. */
  version: number;
  title: string;
  steps: readonly SopStep[];
  /**
   * The metric this SOP claims to move (see `measure.ts`). Optional but
   * honest: a SOP without a metric can claim compliance, never improvement.
   */
  metricId?: string | null;
}

/**
 * Weakest-link derivation. The verdict's reasons name the step(s) that
 * forced the tier, so the approval screen shows WHY, not just a number.
 * A SOP with no steps is not a procedure — declaring one is a spec bug.
 */
export function deriveSopTier(steps: readonly SopStep[]): TierVerdict {
  if (steps.length === 0) {
    throw new Error('a SOP with no steps is not a procedure');
  }
  let worstStep = steps[0];
  let worst = deriveTier(worstStep.input);
  for (const step of steps.slice(1)) {
    const v = deriveTier(step.input);
    if (v.tier > worst.tier) {
      worst = v;
      worstStep = step;
    }
  }
  return {
    tier: worst.tier,
    mode: worst.mode,
    reasons: worst.reasons.map((r) => `step "${worstStep.actionKind}": ${r}`),
  };
}

/**
 * Governor key. Earned autonomy is per (id, version): edit the procedure,
 * re-earn the trust. Feed this to `TierGovernor.record/effectiveTier`.
 */
export function sopGovernorKey(spec: Pick<SopSpec, 'id' | 'version'>): string {
  return `sop:${spec.id}@v${spec.version}`;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

/**
 *  draft     written, unproven — must not run.
 *  verified  the oracle checked it against the real system.
 *  approved  a human read it and signed — the only runnable status.
 *  retired   done for good. A retired SOP never resurrects: new version.
 */
export type SopStatus = 'draft' | 'verified' | 'approved' | 'retired';

export const SOP_STATUSES: readonly SopStatus[] = ['draft', 'verified', 'approved', 'retired'];

export type SopEvent =
  | 'verify_passed'
  | 'verify_failed'
  | 'approved_by_human'
  | 'edited'
  | 'retired';

/**
 * Pure transition. Illegal combinations keep the status (never throw
 * mid-flow) — approving a draft does nothing, because nobody verified
 * what the human would be signing.
 */
export function sopTransition(status: SopStatus, event: SopEvent): SopStatus {
  if (status === 'retired') return 'retired';
  switch (event) {
    case 'verify_passed':
      return status === 'draft' ? 'verified' : status;
    case 'verify_failed':
      return 'draft';
    case 'approved_by_human':
      return status === 'verified' ? 'approved' : status;
    case 'edited':
      // The text the human approved no longer exists.
      return 'draft';
    case 'retired':
      return 'retired';
  }
}

/** The single gate hosts must call before executing a SOP. */
export function sopRunnable(status: SopStatus): boolean {
  return status === 'approved';
}
