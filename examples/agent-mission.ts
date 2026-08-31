/**
 * Agent mission — where a managed agent (Claude, Mastra) fits the pyramid.
 *
 *   npx tsx examples/agent-mission.ts
 *
 * Short answer: nowhere. The pyramid classifies ACTIONS, not executors —
 * an agent is a stochastic executor, gated at the TOOL BOUNDARY, one call
 * at a time. This file walks the canonical mission that forced the law:
 * a reserve danger scan over a payment fleet.
 *
 *   For each merchant with a risk signal, compute the needed hold
 *   H = 1.25 × (open chargebacks + projected incoming + alerts + debt),
 *   compare it to the held reserve, and fix the material gaps.
 *
 * Reading the fleet is free. Raising a reserve touches a merchant's
 * money. A target above the 40% cap has no right answer. Closing a
 * merchant is refused outright. One mission — four different gates.
 *
 * The division of labor to remember: AGENTS EXPLORE, CODE EXPLOITS.
 * Assigning an account manager is a code action (closed outcome space —
 * you can write its verify() today); diagnosing WHY a merchant's gap is
 * dangerous needs a mission. And once the mission repeats the same path,
 * that path has become a procedure: demote it to a code action or SOP.
 */
import {
  gateToolCall,
  missionGovernorKey,
  missionTier,
  TierGovernor,
  type MissionSpec,
  type Tier,
} from '../src/index';

// ── 1. The mission: goal, mandate, and EVERY tool it may touch ──────────────

const mission: MissionSpec = {
  id: 'reserve-danger-scan',
  version: 1,
  goal: 'size reserve holds across the fleet and fix the material gaps',
  // Max tier the agent crosses ALONE. T1 = it may read and act internally
  // (then tell); anything a merchant can feel pauses for a human.
  mandate: 1,
  tools: [
    {
      kind: 'scan_fleet',
      title: 'read volumes, disputes, alerts, debt (read-only)',
      input: { reversible: true, externallyVisible: false, domain: 'clear' },
    },
    {
      kind: 'project_incoming',
      title: 'project incoming disputes from the charge→dispute lag CDF',
      input: { reversible: true, externallyVisible: false, domain: 'complicated' },
    },
    {
      // The merchant sees their payouts shrink → externally visible.
      // A raise can be lowered later → reversible. T2: veto window.
      // NOTE for hosts: the tool's verify() is where domain rules live —
      // e.g. "a human reserve_override in the last 7 days blocks the
      // auto-raise" is a precondition, not a tier.
      kind: 'raise_reserve',
      title: 'raise a merchant reserve % (material gap: ≥2pts or ≥$500)',
      input: { reversible: true, externallyVisible: true, domain: 'complicated' },
    },
    {
      // Target above the 40% cap: no right answer exists — complex → T4.
      // The agent PREPARES the file; a human frames the problem.
      kind: 'review_above_cap',
      title: 'reserve target above the 40% cap — human frames',
      input: { reversible: true, externallyVisible: false, domain: 'complex' },
    },
    {
      // Declared T5. Listed so the refusal is LOUD and named.
      kind: 'close_merchant',
      title: 'terminate a merchant account',
      input: { reversible: false, externallyVisible: true, domain: 'complex' },
      outOfScope: true,
    },
  ],
};

// ── 2. The runtime loop: gate EVERY tool call, one at a time ────────────────

const governor = new TierGovernor();
const called: Tier[] = [];

function agentWantsTo(toolKind: string): void {
  const d = gateToolCall(mission, toolKind, governor);
  if (d.allow) {
    called.push(d.verdict.tier);
    // ...run the tool, then feed the governor with the real outcome:
    governor.record(d.governorKey, 'success');
    console.log(`  ✓ ${toolKind} ran at T${d.verdict.tier}`);
  } else if (d.outcome === 'pause') {
    called.push(d.verdict.tier);
    // The run pauses; the call lands in the SAME inbox as every other
    // proposal (see subsidium/ui). The human's answer resumes or kills it.
    console.log(`  ⏸ ${toolKind} paused — ${d.reason}`);
  } else {
    console.log(`  ✗ ${toolKind} refused — ${d.reason}`);
  }
}

console.log('run 1 — fresh mission, zero trust:');
agentWantsTo('scan_fleet'); //           T0 ≤ mandate → runs
agentWantsTo('project_incoming'); //     T1 ≤ mandate → runs
agentWantsTo('raise_reserve'); //        T2 > mandate → pauses (proposal)
agentWantsTo('review_above_cap'); //     T4 → pauses, human frames
agentWantsTo('close_merchant'); //       declared T5 → refused
agentWantsTo('drop_table'); //           undeclared → refused (no raw hands)

// A run is a DYNAMIC SOP: weakest link over what it actually called.
console.log(`run tier (weakest link over actual calls): T${missionTier(called)}`);

// ── 3. Earned autonomy — per (version × tool kind), never "the agent" ───────

const key = missionGovernorKey(mission, 'raise_reserve');
for (let i = 0; i < 25; i++) governor.record(key, 'success');

console.log('\nafter 25 clean human-approved raises:');
agentWantsTo('raise_reserve'); // effective T1 ≤ mandate → runs alone now

// One "this needed me" snaps it back — instantly, stickily:
governor.contestUp(key);
console.log('after one contest ("this needed me"):');
agentWantsTo('raise_reserve'); // pauses again until a human reset

// And trust DIES on any version bump (new prompt, new model):
const v2 = { ...mission, version: 2 };
console.log('\nsame agent, version bumped (new prompt):');
const d = gateToolCall(v2, 'raise_reserve', governor);
console.log(`  raise_reserve allowed? ${d.allow} — v2 re-earns from zero`);
