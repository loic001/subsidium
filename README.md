# subsidium

### Humans are the most expensive tier.

Subsidium is an operational-assistance framework for driving an **existing**
system: agents operate it, communicate flawlessly with the humans around it,
and escalate to a person only what has **proven** it needs one.

It is **not a coding agent**. It does not write code, fix codebases, or ship
features. If the output of a task is a diff, it is out of scope. The output
of a subsidium system is an operated business: messages sent, blockers
cleared, cases moved forward, and a short, honest queue for the humans.

The name is the Latin *subsidium* — the reserve line, the reinforcement.
Under the principle of subsidiarity (Aquinas → Taparelli 1840 → art. 5(3)
of the EU treaty), decisions belong to the lowest level capable of handling
them, and **escalation bears the burden of proof — never autonomy**.

Sibling project: [panarchy-llm](https://github.com/loic001/panarchy-llm),
which measured the same architecture with model tiers instead of human
tiers. Subsidium adds the one thing an LLM cascade does not model: a tier
whose budget is a person's **attention**, and whose sampling has a
**social cost**.

## The pyramid

The discriminator between tiers is never "how much the AI does". It is
**who holds the fallback** (the lesson of SAE J3016, and of the
human-in/on/out-of-the-loop vocabulary).

| Tier | Mode | Who holds the fallback |
|---|---|---|
| T0 | `auto_silent` | nobody — acts, logs |
| T1 | `auto_notify` | nobody — acts, then tells |
| T2 | `veto` | a human MAY object within a window; silence lets it fire |
| T3 | `consent` | a human MUST click |
| T4 | `human_decision` | the system prepares the file and asks ONE question |
| T5 | `out_of_scope` | the system only signals |

A tier is **derived, never chosen**, from three objective properties —
never from a model's confidence score, which is neither calibrated nor the
right axis:

1. **Reversibility** — can the effect be undone? (A sent message cannot.)
2. **External visibility** — does anyone outside the organization see it?
3. **Cynefin domain** — clear (a rule applies) / complicated (expertise) /
   complex (no right answer: a human frames it).

Every tier above 0 carries human-readable reasons, enforced structurally.
An unexplained escalation is the exact failure mode this framework exists
to prevent.

## The laws (each one paid for)

**Our own voice is not engagement.** Systems that ingest their own messages
count themselves as replies. Measured on the production system this
framework was extracted from: 81% apparent reply rate, 11% real. Every
engagement counter must pass an authorship predicate, fail-closed:
"I don't know who spoke" never counts as "the counterpart replied".

**Promotion is earned, demotion is a cliff.** An action kind runs one tier
below its derived tier only after a measured track record under an error
budget (the Kubernetes operator lesson: Deep Insights before Auto Pilot).
One human contest — "this needed me" — snaps it back instantly and
stickily. The yellow card — "this did *not* need me" — is evidence for the
review, never a lever: you do not reach autonomy by reclassifying what
gets counted.

**Reframe, never force.** With a human counterpart, resampling is not free:
repetition has a punitive social cost. A stalled thread is never re-nudged
identically — the next move must change the channel, the counterpart, or
the question, or close the thread (Bateson; measured in panarchy-llm as
decomposition 98% vs escalation 90%).

**Errors ascend compressed.** The tier above needs to know what failed and
what was tried — never the raw history (Beer's algedonic signal, Friston's
prediction errors). Handing a human the full dump spends their attention
on reading instead of deciding.

**Attention is a budget, not a firehose.** When the human tier's daily
minutes are spent, escalations queue; they do not spill. An overflowing
inbox teaches its owner to ignore all of it.

## Vocabulary

| Concept | One line |
|---|---|
| `Subject` | the entity being helped through a process (a merchant, an applicant) — *not* called "agent" |
| `Counterpart` | a human the system talks to, with a side: `us` or `them` |
| `ChannelSpec` | a transport described by reversibility, external visibility, observability |
| `ActionSpec` | `describe` / `verify` / `execute` — `verify` is the oracle, and an action without a real one is a turkey |
| `Thread` | a conversation scoped to a subject **and a topic** — one person can hold n threads |
| `TierVerdict` | derived tier + mode + the reasons that forced it up |
| `TierGovernor` | learned trust per action kind: slow earned promotion, instant sticky demotion |
| `EscalationSignal` | the compressed failure that ascends |
| `AttentionBudget` | minutes per day, minutes per item — the human tier's ledger |

## Status — read before using

Extracted from a production system operating a payments company's merchant
activation (hundreds of subjects, a real team, a real founder as the top
tier). The core primitives here are pure, deterministic, and tested. The
architecture's *outcome* claims (does the pyramid beat all-goes-to-approval
on cases-unblocked-per-attention-hour?) are **being measured, not yet
proven** — the sibling repo's standard applies: a number without an n and a
reproducible script is a vibe.

## License

MIT
