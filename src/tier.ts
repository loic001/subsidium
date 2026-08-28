/**
 * subsidium · tier classifier
 *
 * Derives the pyramid tier of an action from three OBJECTIVE properties:
 * reversibility, external visibility, Cynefin domain. Deterministic, no
 * model call, no confidence score — an LLM's confidence is not calibrated,
 * and it is not the right axis: a message can be drafted at 0.95 confidence
 * and remain irreversible.
 *
 * The table, and why each cell is where it is:
 *
 *  - complex domain          → T4/T5. No right answer exists; the system
 *    prepares the file, a human frames the problem.
 *  - externally visible +
 *    irreversible            → T3. Someone outside the org sees it and we
 *    cannot take it back: consent. (A merchant message.)
 *  - externally visible +
 *    reversible              → T2. Visible but repairable: veto window.
 *  - internal + irreversible → T2. Nobody outside sees it, but we cannot
 *    undo it: a human may object before it fires.
 *  - internal + reversible   → T1 if complicated (act then tell — an expert
 *    might want to know), T0 if clear (a rule applied a rule).
 *
 * Escalation bears the burden of proof: every tier above 0 carries at least
 * one reason, and `deriveTier` guarantees it structurally.
 */
import type { ChannelSpec, Domain, Tier, TierVerdict } from './types';
import { TIER_MODE } from './types';

export interface TierInput {
  /** Action-level reversibility AND channel-level, combined by the caller. */
  reversible: boolean;
  /** True when the channel (or effect) is seen outside the organization. */
  externallyVisible: boolean;
  domain: Domain;
}

/** Combine action + channel properties into a TierInput. */
export function tierInput(
  action: { reversible: boolean; domain: Domain },
  channel: ChannelSpec | null,
): TierInput {
  return {
    // Irreversible if EITHER the action or its transport is: a reversible
    // config change announced on an irreversible channel is irreversible.
    reversible: action.reversible && (channel === null || channel.reversible),
    externallyVisible: channel !== null && channel.externallyVisible,
    domain: action.domain,
  };
}

export function deriveTier(input: TierInput): TierVerdict {
  const reasons: string[] = [];

  if (input.domain === 'complex') {
    reasons.push('complex domain: no right answer exists, a human must frame the problem');
    if (!input.reversible) reasons.push('irreversible');
    if (input.externallyVisible) reasons.push('externally visible');
    return verdict(4, reasons);
  }

  if (input.externallyVisible && !input.reversible) {
    reasons.push('externally visible');
    reasons.push('irreversible');
    return verdict(3, reasons);
  }

  if (input.externallyVisible) {
    reasons.push('externally visible (but repairable)');
    return verdict(2, reasons);
  }

  if (!input.reversible) {
    reasons.push('irreversible (but internal)');
    return verdict(2, reasons);
  }

  if (input.domain === 'complicated') {
    reasons.push('requires expertise: act, then tell');
    return verdict(1, reasons);
  }

  return verdict(0, []);
}

function verdict(tier: Tier, reasons: string[]): TierVerdict {
  /* v8 ignore start -- structurally unreachable tripwire: every call site
     above pushes a reason before escalating, and the exhaustive table test
     proves it over the whole input space. Kept because an unexplained
     escalation is the exact failure mode this framework exists to prevent,
     and a future edit that breaks the invariant must explode, not ship. */
  if (tier > 0 && reasons.length === 0) {
    throw new Error(`tier ${tier} without a reason`);
  }
  /* v8 ignore stop */
  return { tier, mode: TIER_MODE[tier], reasons };
}
