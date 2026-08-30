/**
 * Subsidium × Mastra — the executor executes, the door decides.
 *
 *   npx tsx examples/mastra-gate.ts
 *   (no API key needed: the demo drives the tools directly, exactly as the
 *   Mastra runtime would after a model picked them)
 *
 * The division of labor:
 *
 *   MASTRA owns the LOOP — the model call, tool routing, retries, workflows.
 *   SUBSIDIUM owns the DOOR — every tool is wrapped by the same gate:
 *   derive the tier from properties, apply EARNED autonomy, spend human
 *   attention only on what proved it needs a human.
 *
 * The agent never knows the difference: a gated tool always answers.
 * Sometimes the answer is "done"; sometimes it is "queued for a human" —
 * and the agent plans around that like any other tool result.
 */
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  admit,
  DEFAULT_GOVERNOR_OPTIONS,
  deriveSopTier,
  deriveTier,
  EMPTY_ATTENTION,
  judge,
  reading,
  sopGovernorKey,
  sopRunnable,
  sopTransition,
  TIER_MODE,
  TierGovernor,
  tierInput,
  type ActionSpec,
  type AttentionBudget,
  type ChannelSpec,
  type MetricSpec,
  type SopSpec,
} from '../src/index';

// ── 1. Channels and actions, exactly as in gate-an-agent.ts ─────────────────

const crm: ChannelSpec = { id: 'crm', reversible: true, externallyVisible: false, observable: true };
const merchantEmail: ChannelSpec = {
  id: 'merchant_email',
  reversible: false,
  externallyVisible: true,
  observable: true,
};

type Ctx = { merchantId: string };

const tagAccount: ActionSpec<Ctx> = {
  kind: 'tag_account',
  channel: crm,
  reversible: true,
  domain: 'clear',
  describe: (c) => `tag ${c.merchantId} as dormant`,
  verify: async () => ({ ok: true, report: 'account exists, tag absent' }),
  execute: async () => ({ ok: true, result: 'tagged' }),
};

const emailMerchant: ActionSpec<Ctx> = {
  kind: 'email_merchant',
  channel: merchantEmail,
  reversible: false,
  domain: 'complicated',
  describe: (c) => `email ${c.merchantId} a reactivation offer`,
  verify: async () => ({ ok: true, report: 'merchant is dormant on fresh data' }),
  execute: async () => ({ ok: true, result: 'sent' }),
};

// ── 2. The door: one gate, every tool goes through it ───────────────────────

const governor = new TierGovernor(DEFAULT_GOVERNOR_OPTIONS);
const founderBudget: AttentionBudget = { minutesPerDay: 60, minutesPerItem: 3 };
let attention = EMPTY_ATTENTION;
export const consentQueue: string[] = []; // your inbox UI (see subsidium/ui)

type GateResult = { status: string; detail: string };

function gated(action: ActionSpec<Ctx>): (ctx: Ctx) => Promise<GateResult> {
  return async (ctx) => {
    const derived = deriveTier(tierInput(action, action.channel));
    const tier = governor.effectiveTier(action.kind, derived.tier);
    const mode = TIER_MODE[tier];

    if (mode === 'auto_silent' || mode === 'auto_notify') {
      const check = await action.verify(ctx); // the oracle, on fresh data
      if (!check.ok) return { status: 'blocked_by_oracle', detail: check.report };
      const run = await action.execute(ctx);
      governor.record(action.kind, run.ok ? 'success' : 'failure');
      return { status: 'executed', detail: `${run.result} (T${tier} · ${mode})` };
    }

    if (mode === 'veto') {
      // Fires after the window unless a human objects — same execute path.
      return { status: 'veto_window_open', detail: `${action.describe(ctx)} — T${tier}` };
    }

    // consent / human_decision / out_of_scope → a human, within their budget.
    const decision = admit(founderBudget, attention);
    attention = decision.state;
    if (decision.admit) consentQueue.push(action.describe(ctx));
    return {
      status: decision.admit ? 'queued_for_human' : 'queued_for_tomorrow',
      detail: `${derived.reasons.join('; ')} — T${tier} · ${mode}`,
    };
  };
}

// ── 3. Real Mastra tools — the gate IS the execute ──────────────────────────

const gates = {
  tag_account: gated(tagAccount),
  email_merchant: gated(emailMerchant),
};

const toolIo = {
  inputSchema: z.object({ merchantId: z.string() }),
  outputSchema: z.object({ status: z.string(), detail: z.string() }),
};

export const tagAccountTool = createTool({
  id: 'tag_account',
  description: 'Tag a dormant merchant in the CRM (internal, reversible).',
  ...toolIo,
  execute: async ({ merchantId }) => gates.tag_account({ merchantId }),
});

export const emailMerchantTool = createTool({
  id: 'email_merchant',
  description: 'Email a merchant a reactivation offer (external, irreversible).',
  ...toolIo,
  execute: async ({ merchantId }) => gates.email_merchant({ merchantId }),
});

// The agent is plain Mastra — it does not know subsidium exists.
export const opsAgent = new Agent({
  id: 'ops-agent',
  name: 'ops-agent',
  instructions:
    'You reactivate dormant merchants. Tag them, then email an offer. ' +
    'If a tool answers "queued_for_human", move on — a human will decide.',
  model: 'openai/gpt-4o-mini',
  tools: { tagAccountTool, emailMerchantTool },
});

// ── 4. The SOP: what the agent runs is a procedure a human approved ONCE ────

const reactivation: MetricSpec = {
  id: 'reactivation_rate',
  definition: 'dormant merchants active again / dormant merchants contacted, 60d',
  unit: 'ratio',
  direction: 'up',
};

const reactivateDormant: SopSpec = {
  id: 'reactivate_dormant',
  version: 1,
  title: 'Reactivate dormant merchants',
  metricId: reactivation.id,
  steps: [
    { actionKind: 'tag_account', title: 'tag as dormant', input: tierInput(tagAccount, crm) },
    { actionKind: 'email_merchant', title: 'send the offer', input: tierInput(emailMerchant, merchantEmail) },
  ],
};

// ── 5. Run it ────────────────────────────────────────────────────────────────

const main = async () => {
  const sopTier = deriveSopTier(reactivateDormant.steps);
  console.log(`\nSOP "${reactivateDormant.title}" v${reactivateDormant.version}`);
  console.log(`  weakest link: T${sopTier.tier} — ${sopTier.reasons.join('; ')}`);
  console.log(`  governor key: ${sopGovernorKey(reactivateDormant)} (edit it → v2 → trust re-earned)`);

  // draft → verified (oracle) → approved (human, once). Only then runnable.
  const status = sopTransition(sopTransition('draft', 'verify_passed'), 'approved_by_human');
  console.log(`  lifecycle: approved · runnable=${sopRunnable(status)}`);

  // In production the model picks the tool and the Mastra runtime invokes
  // its execute; the demo calls the same gates directly (no API key needed).
  console.log('\nThe agent calls the tools; the door decides:');
  for (const merchantId of ['m_42', 'm_58']) {
    const tag = await gates.tag_account({ merchantId });
    console.log(`  tag_account(${merchantId})     → ${tag.status}: ${tag.detail}`);
    const mail = await gates.email_merchant({ merchantId });
    console.log(`  email_merchant(${merchantId})  → ${mail.status}: ${mail.detail}`);
  }
  console.log(`\nHuman inbox: ${consentQueue.length} item(s), ${attention.spentToday} min of 60 spent`);

  // 60 days later: did the SOP's claim survive an honest judge?
  const verdict = judge(
    reactivation,
    reading(reactivation, 0.18, 120), // cohort the SOP touched
    reading(reactivation, 0.12, 130), // untouched control
  );
  console.log(`\nMetric "${reactivation.id}": ${verdict.verdict} — ${verdict.reason}`);
  console.log('(change the definition between readings and judge() answers not_comparable)\n');
};

void main();
