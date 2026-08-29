/**
 * subsidium · core vocabulary
 *
 * SCOPE — read this before adding anything.
 *
 * Subsidium is a framework for operating an EXISTING system and optimizing
 * its usage: communicating flawlessly with humans, and using agents to drive
 * a system that already works. It is NOT a coding agent. It does not write
 * code, fix codebases, or ship features. If a task's output is a diff, it is
 * out of scope.
 *
 * The central idea comes from the principle of subsidiarity (Aquinas →
 * Taparelli 1840 → art. 5(3) TEU): decisions belong to the LOWEST level
 * capable of handling them, and it is the ESCALATION that bears the burden
 * of proof, never the autonomy. The human is not the operator of this
 * system. The human is its most expensive tier — its insurance — and is
 * billed (in attention) only on proven failure of the tiers below.
 *
 * Sibling project: panarchy-llm, which measured the same architecture with
 * model tiers instead of human tiers. Subsidium extends it with the one
 * thing an LLM cascade does not model: a tier whose budget is a person's
 * attention, and whose sampling has a SOCIAL cost (you cannot resample a
 * colleague at temperature 1.0).
 */

// ── Subject ──────────────────────────────────────────────────────────────────

/**
 * The entity being helped through a process — a merchant, a customer, an
 * applicant. NOT called "agent": that word now means the software worker,
 * and overloading it poisons every conversation about the system.
 */
export interface Subject {
  id: string;
  name: string | null;
  /** Where the subject stands in the host system's own lifecycle. */
  stage: string | null;
  /** Host-system properties the framework passes through untouched. */
  data?: Record<string, unknown>;
}

// ── Counterpart ──────────────────────────────────────────────────────────────

/**
 * A human the system talks to or about. Every counterpart has a side:
 * counting an `us` voice as engagement from `them` is the single most
 * expensive measurement bug this framework's authors have shipped
 * (81% apparent reply rate vs 11% real).
 */
export interface Counterpart {
  id: string;
  name: string;
  /** 'us' = our team (roster). 'them' = the subject's side. */
  side: 'us' | 'them';
  /** BCP 47-ish language the counterpart actually writes in. */
  lang?: string;
  email?: string | null;
  /** Per-channel handles (slack id, phone, ...). */
  handles?: Record<string, string>;
}

// ── Channel ──────────────────────────────────────────────────────────────────

/**
 * A transport, described by the two properties that decide how much autonomy
 * an action on it can be granted. These are properties of the CHANNEL, known
 * without any model call — never a model's confidence score.
 */
export interface ChannelSpec {
  id: string;
  /** Can the effect be undone after the fact? A sent message cannot. */
  reversible: boolean;
  /** Does anyone OUTSIDE the organization see the effect? */
  externallyVisible: boolean;
  /** Can we observe replies on this channel? (Feeds the engagement law.) */
  observable: boolean;
}

// ── Cynefin domain ───────────────────────────────────────────────────────────

/**
 * Which kind of problem the action addresses (Snowden, 1999).
 *  - clear:       a known rule applies — automatable.
 *  - complicated: requires expertise, has right answers — assistable.
 *  - complex:     no right answer, only safe-to-fail probes — human framing.
 * The domain is declared per ACTION KIND and revisited when outcomes drift:
 * "best practice is, by definition, past practice."
 */
export type Domain = 'clear' | 'complicated' | 'complex';

// ── Tiers & gates ────────────────────────────────────────────────────────────

/**
 * The subsidiarity pyramid. Low tiers act; high tiers think with a human.
 * The discriminator is never "how much the AI does" — it is WHO HOLDS THE
 * FALLBACK (the lesson of SAE J3016 and of HITL/HOTL/HOOTL vocabulary).
 *
 *  T0 auto_silent    acts, logs.                       (human-out-of-the-loop)
 *  T1 auto_notify    acts, then tells.                 (human-out-of-the-loop)
 *  T2 veto           fires unless a human objects
 *                    within a window.                  (human-on-the-loop)
 *  T3 consent        needs an explicit click.          (human-in-the-loop)
 *  T4 human_decision the system prepares the file and
 *                    asks ONE question; a human decides.
 *  T5 out_of_scope   the system only signals.
 */
export type Tier = 0 | 1 | 2 | 3 | 4 | 5;

export type GateMode =
  | 'auto_silent'
  | 'auto_notify'
  | 'veto'
  | 'consent'
  | 'human_decision'
  | 'out_of_scope';

export const TIER_MODE: Record<Tier, GateMode> = {
  0: 'auto_silent',
  1: 'auto_notify',
  2: 'veto',
  3: 'consent',
  4: 'human_decision',
  5: 'out_of_scope',
};

/**
 * Why an action sits at its tier. Escalation bears the burden of proof:
 * a tier above 1 with an empty `reasons` array is a bug, and the classifier
 * enforces it. (Mirror of the EU Court of Justice doctrine: the higher
 * level must explain why the lower level was insufficient.)
 */
export interface TierVerdict {
  tier: Tier;
  mode: GateMode;
  /** Human-readable reasons, one per property that forced the tier up. */
  reasons: string[];
}

// ── Action ───────────────────────────────────────────────────────────────────

/**
 * Something the system can do to the host system or say to a counterpart.
 * `verify` is the ORACLE (panarchy rule 1): it checks preconditions against
 * the real system before `execute` is allowed to run. An action without a
 * real verify is a turkey — 100% apparent success until the day it matters.
 */
export interface ActionSpec<Ctx = unknown> {
  kind: string;
  /** Channel the action's effect travels on (null = internal state only). */
  channel: ChannelSpec | null;
  /** Can the action itself be undone, independently of the channel? */
  reversible: boolean;
  domain: Domain;
  describe: (ctx: Ctx) => string;
  verify: (ctx: Ctx) => Promise<{ ok: boolean; report: string }>;
  execute: (ctx: Ctx) => Promise<{ ok: boolean; result: string }>;
}

// ── Escalation ───────────────────────────────────────────────────────────────

/**
 * Beer's algedonic signal: what ascends when a tier failed to absorb.
 * Errors ascend COMPRESSED — never the full context (Friston: prediction
 * errors, not raw data, revise the level above).
 */
export interface EscalationSignal {
  subjectId: string;
  /** Action kind or thread subject that failed to resolve. */
  about: string;
  attempts: number;
  /** Hard-capped summary; the compressor enforces the cap. */
  failureSummary: string;
}

// ── Thread ───────────────────────────────────────────────────────────────────

/**
 * A conversation scoped to a SUBJECT AND A TOPIC — not to a place, not to a
 * person. One counterpart can hold n threads, each with its own goal and its
 * own life. When a thread stalls, the framework never re-sends more force at
 * the same level (Bateson): it REFRAMES — new channel, new counterpart, or
 * new question — or it closes.
 */
export type ThreadStatus = 'awaiting_reply' | 'answered' | 'stalled' | 'resolved' | 'abandoned';

/** Identity of a thread. Place and person are the current FRAME, not the key. */
export interface ThreadId {
  subjectId: string;
  /** Opaque host key — already normalized (`normalizeTopic`). */
  topic: string;
}

export interface ThreadState {
  status: ThreadStatus;
  /** Nudges sent since the last counterpart reply. */
  nudgesSinceReply: number;
  /** Distinct frames tried (channel/counterpart/question changes). */
  framesTried: number;
}

// ── Attention ────────────────────────────────────────────────────────────────

/**
 * The unit of cost of a human tier. A model tier bills dollars; a human
 * tier bills minutes of a person's day, and the budget regenerates. When
 * the budget is exhausted, escalations queue — they do not spill.
 */
export interface AttentionBudget {
  /** Minutes available per day for this human tier. */
  minutesPerDay: number;
  /** Estimated minutes one escalation costs (read + decide). */
  minutesPerItem: number;
}
