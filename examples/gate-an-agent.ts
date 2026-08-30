/**
 * Gate an agent — the 5-minute integration.
 *
 *   npx tsx examples/gate-an-agent.ts
 *
 * Your agent (Hermes, OpenClaw, Mastra, a cron script, an intern) proposes
 * actions. Subsidium is the door: it derives who holds the fallback, lets
 * the safe tiers run, queues the rest for a human — and moves the line as
 * trust is EARNED, kind by kind.
 *
 * In a real host, `agentWantsTo` is your agent's tool call and the
 * consent queue is your inbox UI (see `subsidium/ui`). Everything else
 * is exactly this file.
 */
import {
  admit,
  DEFAULT_GOVERNOR_OPTIONS,
  deriveTier,
  EMPTY_ATTENTION,
  TIER_MODE,
  TierGovernor,
  tierInput,
  type ActionSpec,
  type AttentionBudget,
  type ChannelSpec,
} from '../src/index';

// ── 1. Declare your channels by their PROPERTIES, not their vibes ───────────

const crm: ChannelSpec = {
  id: 'crm',
  reversible: true, // a tag can be removed
  externallyVisible: false, // nobody outside the org sees it
  observable: true,
};

const merchantEmail: ChannelSpec = {
  id: 'merchant_email',
  reversible: false, // a sent email cannot be unsent
  externallyVisible: true, // the merchant sees it
  observable: true,
};

// ── 2. Declare what the agent may attempt (verify is the oracle) ────────────

type Ctx = { subjectId: string };

const actions: Record<string, ActionSpec<Ctx>> = {
  tag_account: {
    kind: 'tag_account',
    channel: crm,
    reversible: true,
    domain: 'clear', // a known rule applies
    describe: (c) => `tag ${c.subjectId} as dormant`,
    verify: async () => ({ ok: true, report: 'account exists, tag absent' }),
    execute: async () => ({ ok: true, result: 'tagged' }),
  },
  archive_dead_file: {
    kind: 'archive_dead_file',
    channel: crm,
    reversible: false, // archiving closes the file for good
    domain: 'clear',
    describe: (c) => `archive ${c.subjectId} (merchant confirmed they left)`,
    verify: async () => ({ ok: true, report: 'no open requests, no recent activity' }),
    execute: async () => ({ ok: true, result: 'archived' }),
  },
  email_merchant: {
    kind: 'email_merchant',
    channel: merchantEmail,
    reversible: false,
    domain: 'complicated',
    describe: (c) => `email ${c.subjectId} about their missing bank document`,
    verify: async () => ({ ok: true, report: 'blocker still real on fresh data' }),
    execute: async () => ({ ok: true, result: 'sent' }),
  },
};

// ── 3. The door ──────────────────────────────────────────────────────────────

const governor = new TierGovernor(DEFAULT_GOVERNOR_OPTIONS); // persist with dump()/hydrate()
const founderBudget: AttentionBudget = { minutesPerDay: 60, minutesPerItem: 3 };
let attention = EMPTY_ATTENTION;
const consentQueue: string[] = [];

async function agentWantsTo(kind: string, ctx: Ctx): Promise<void> {
  const action = actions[kind];
  const derived = deriveTier(tierInput(action, action.channel));
  const effective = governor.effectiveTier(action.kind, derived.tier);
  const mode = TIER_MODE[effective];
  const label = `${action.describe(ctx)}  [derived T${derived.tier}, runs at T${effective} · ${mode}]`;

  if (mode === 'auto_silent' || mode === 'auto_notify') {
    const check = await action.verify(ctx);
    if (!check.ok) return console.log(`  ✗ blocked by oracle: ${label} — ${check.report}`);
    const run = await action.execute(ctx);
    governor.record(action.kind, run.ok ? 'success' : 'failure');
    return console.log(`  ✓ ${mode === 'auto_notify' ? 'done, told the log' : 'done silently'}: ${label}`);
  }

  if (mode === 'veto') {
    // Fires after your veto window unless a human objects. Same execute path.
    return console.log(`  ⏲ veto window opened: ${label}`);
  }

  // consent / human_decision / out_of_scope → a human. Attention is a budget.
  const decision = admit(founderBudget, attention);
  attention = decision.state;
  if (decision.admit) {
    consentQueue.push(label);
    return console.log(`  👤 waiting for a human click: ${label}`);
  }
  console.log(`  ⏸ human budget spent — queued for tomorrow, not spilled: ${label}`);
}

// ── 4. Watch autonomy being EARNED, then lost in one strike ─────────────────

const main = async () => {
  console.log('\nDay 1 — no track record, the pyramid alone decides:');
  await agentWantsTo('tag_account', { subjectId: 'merchant_42' }); // T0 auto
  await agentWantsTo('archive_dead_file', { subjectId: 'merchant_17' }); // T2 veto
  await agentWantsTo('email_merchant', { subjectId: 'merchant_42' }); // T3 click

  // Twenty clean archives later (vetoes that fired without objection)...
  for (let i = 0; i < 20; i++) governor.record('archive_dead_file', 'success');

  console.log('\nDay 30 — archive_dead_file EARNED one tier of autonomy (T2 → T1):');
  await agentWantsTo('archive_dead_file', { subjectId: 'merchant_58' }); // now auto_notify

  // One human says "this one needed me" — instant, sticky demotion.
  governor.contestUp('archive_dead_file');

  console.log('\nDay 31 — one contest snapped it back to T2, until a deliberate reset:');
  await agentWantsTo('archive_dead_file', { subjectId: 'merchant_63' }); // veto again

  console.log(`\nHuman inbox (${consentQueue.length} item, ${attention.spentToday} min of 60 spent):`);
  for (const item of consentQueue) console.log(`  · ${item}`);
  console.log();
};

void main();
