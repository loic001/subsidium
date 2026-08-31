/**
 * subsidium · mission — the agent is an EXECUTOR, not a tier
 *
 * "Where does the agent sit in the pyramid?" is a category error. The
 * pyramid classifies ACTIONS — by reversibility, visibility, domain — and
 * answers "who must approve this?", never "who does the work?". The human
 * is not a stage of the pipeline either: the human is a GATE that certain
 * tiers must pass. Agents and code actions both run AROUND the gates.
 *
 * What separates them is the CLOSURE of the outcome space, not complexity:
 *
 *  CODE ACTION — deterministic executor. You can write `verify()` as a
 *  precise precondition and `execute()` as a closed sequence. Its tier is
 *  known IN ADVANCE (statically, or weakest-link over known steps — a SOP).
 *
 *  MISSION — stochastic executor (a managed agent). The path is not
 *  enumerable in advance: it reads, diagnoses, composes steps. You cannot
 *  tier a plan that does not exist yet — so you tier AT THE TOOL BOUNDARY,
 *  call by call.
 *
 * Five laws, each blocking a real failure mode:
 *
 *  1. NO RAW HANDS — an agent touches the world ONLY through declared,
 *     gated tools. An undeclared tool call is refused, fail closed.
 *  2. GATE PER CALL — approving a whole run upfront prices every mission
 *     at the worst tool it COULD reach; per-call gating spends attention
 *     only when the agent actually crosses a line. The mandate is the max
 *     tier the agent crosses alone; above it, the call PAUSES and becomes
 *     an ordinary proposal in the human's inbox.
 *  3. A RUN IS A DYNAMIC SOP — its effective tier is the weakest link over
 *     the tools it ACTUALLY called, discovered at runtime (`missionTier`).
 *  4. TRUST BELONGS TO (mission version × tool kind), never to "the
 *     agent". Change the prompt or the model → new version → trust
 *     re-earned from zero (same door Goodhart uses on SOPs: keep the
 *     name, change what it does).
 *  5. EXPLORATION → EXPLOITATION — a mission that repeats the same path
 *     has DISCOVERED a procedure: demote it to a code action / SOP. The
 *     agent is the exploration phase; the code action is the fossil of an
 *     exploration that ended. (If you can now write the `verify()`, it is
 *     no longer a mission.)
 */
import type { TierGovernor } from './governor';
import { deriveTier, type TierInput } from './tier';
import type { Tier, TierVerdict } from './types';

// ── Executor vocabulary ──────────────────────────────────────────────────────

/**
 * Who runs the work. Decision rule: if you can write `verify()` as a
 * precise precondition, it is `code`; if the path is unknown, `agent` —
 * and once the agent repeats the same path, it must become `code` again.
 */
export type ExecutorKind = 'code' | 'agent';

// ── Spec ─────────────────────────────────────────────────────────────────────

/** One tool the agent may call. `input` = `tierInput(action, channel)`. */
export interface MissionTool {
  kind: string;
  /** What the tool does, in the host's language. */
  title: string;
  input: TierInput;
  /**
   * Declared out-of-scope by the host (T5): the tool is listed so the
   * refusal is LOUD and named, instead of an undeclared-tool error.
   */
  outOfScope?: boolean;
}

export interface MissionSpec {
  id: string;
  /** Bump on ANY edit of goal, tools, prompt or model — trust is keyed on it. */
  version: number;
  /** The goal a human approved ONCE, as an ordinary proposal. */
  goal: string;
  /**
   * Max tier the agent crosses ALONE. Above → the call pauses (proposal).
   * A mandate above T2 is a spec bug: T3 is BY DEFINITION an explicit
   * human click and T4 a human decision — a mandate that auto-crosses
   * them is a contradiction in terms.
   */
  mandate: Tier;
  tools: readonly MissionTool[];
}

/**
 * Governor key — earned autonomy is per (mission id, version, TOOL kind).
 * The agent as a whole never earns trust; its tool kinds do.
 */
export function missionGovernorKey(
  mission: Pick<MissionSpec, 'id' | 'version'>,
  toolKind: string,
): string {
  return `mission:${mission.id}@v${mission.version}:${toolKind}`;
}

// ── Gate — one decision per tool call ────────────────────────────────────────

export type ToolCallDecision =
  /** Below or at the mandate: the agent proceeds without stopping. */
  | { allow: true; verdict: TierVerdict; governorKey: string }
  /** Above the mandate: pause the run, surface an ordinary proposal. */
  | { allow: false; outcome: 'pause'; verdict: TierVerdict; governorKey: string; reason: string }
  /** Undeclared or declared out-of-scope: refuse, fail closed. */
  | { allow: false; outcome: 'refuse'; reason: string };

/**
 * The gate an agent runtime (Mastra, managed Claude agent, …) calls before
 * EVERY tool execution. Pure decision — the pause/propose mechanics belong
 * to the host, and land in the same inbox as every other proposal.
 */
export function gateToolCall(
  mission: MissionSpec,
  toolKind: string,
  governor?: TierGovernor,
): ToolCallDecision {
  if (mission.mandate > 2) {
    throw new Error(
      `mission "${mission.id}" mandate T${mission.mandate}: T3+ is by definition a human gate — a mandate cannot auto-cross it`,
    );
  }
  const tool = mission.tools.find((t) => t.kind === toolKind);
  if (!tool) {
    // NO RAW HANDS — fail closed on anything the spec did not declare.
    return { allow: false, outcome: 'refuse', reason: `undeclared tool "${toolKind}"` };
  }
  if (tool.outOfScope) {
    return { allow: false, outcome: 'refuse', reason: `tool "${toolKind}" is declared out of scope (T5)` };
  }
  const verdict = deriveTier(tool.input);
  const governorKey = missionGovernorKey(mission, toolKind);
  const effective = governor ? governor.effectiveTier(governorKey, verdict.tier) : verdict.tier;
  if (effective <= mission.mandate) {
    return { allow: true, verdict: { ...verdict, tier: effective }, governorKey };
  }
  return {
    allow: false,
    outcome: 'pause',
    verdict: { ...verdict, tier: effective },
    governorKey,
    // A pause implies effective ≥ 1, and deriveTier guarantees reasons ≥ 1
    // for any tier above 0 — the join is never empty.
    reason: `T${effective} > mandate T${mission.mandate}: ${verdict.reasons.join('; ')}`,
  };
}

// ── Weakest link, discovered at runtime ──────────────────────────────────────

/**
 * The effective tier of a RUN: the max over the tools it actually called —
 * the SOP weakest-link law, applied to a chain that only exists after the
 * fact. A run that touched nothing sits at T0.
 */
export function missionTier(calledTiers: readonly Tier[]): Tier {
  let worst: Tier = 0;
  for (const t of calledTiers) if (t > worst) worst = t;
  return worst;
}
