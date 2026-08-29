# subsidium

[![ci](https://github.com/loic001/subsidium/actions/workflows/ci.yml/badge.svg)](https://github.com/loic001/subsidium/actions/workflows/ci.yml)

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

![The subsidiarity pyramid — six tiers from auto_silent to out_of_scope, width proportional to intended share of actions, the human on top with a finite attention budget](art/pyramid.png)

A tier is **derived, never chosen**, from three objective properties —
never from a model's confidence score, which is neither calibrated nor the
right axis: **reversibility** (a sent message cannot be unsent),
**external visibility** (does anyone outside the organization see it?),
and the **Cynefin domain** (clear / complicated / complex).

![A tier is derived, never chosen — the full 12-cell truth table: reversibility and visibility as rows, Cynefin domain as columns, each cell carrying its tier and its reason](art/derivation.png)

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

![Promotion is earned, demotion is a cliff — derived T3, promoted to T2 after 20 clean runs under the error budget, snapped back to T3 by one human contest, sticky until a deliberate reset](art/governor.png)

**Reframe, never force.** With a human counterpart, resampling is not free:
repetition has a punitive social cost. A stalled thread is never re-nudged
identically — the next move must change the channel, the counterpart, or
the question, or close the thread (Bateson; measured in panarchy-llm as
decomposition 98% vs escalation 90%).

![Reframe, never force — one nudge per frame, then reframe by changing channel, counterpart or question, three frames maximum, then close: the topic is exhausted, not the counterpart](art/thread.png)

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

## Tested like it decides someone's day — because it does

Every primitive here decides whether a human gets disturbed, so the test
bar is the sibling repo's, not the industry's:

- **100% coverage on `src/` — statements, branches, functions, lines —
  enforced in CI** (`vitest.config.ts` thresholds: the build fails below).
  The only tolerated gap is an explicit `v8 ignore` block carrying its
  justification inline (there is exactly one: a structurally unreachable
  tripwire, proven unreachable by the exhaustive table test).
- **The classifier is tested over its ENTIRE input space** (2×2×3 = 12
  cells — no excuse for sampling), plus three monotonicity laws: losing
  reversibility, gaining visibility, or hardening the domain can never
  LOWER a tier. Without monotonicity the pyramid can be gamed by
  re-describing an action.
- **The governor is fuzzed** with seeded random event sequences (n=500)
  against its core invariant: the effective tier is always the derived
  tier or exactly one below, never lower.
- **Pathological configs explode instead of degrading silently**: an
  attention budget that can never admit a single item throws at first use
  — a silent infinite queue wearing the costume of a tight budget is a
  turkey.

Run it: `npm install && npm run typecheck && npm run coverage`.

The figures above are not hand-drawn: their HTML source lives in
[`art/diagrams.html`](art/diagrams.html) — edit, reload, re-shoot.

## The closed world — `npm run sim`

Before the framework is allowed to spend a minute of a human's attention or
a counterpart's patience, its laws run inside a **seeded, deterministic,
free** simulation ([`src/sim.ts`](src/sim.ts)) that drives the REAL
primitives — `deriveTier`, `TierGovernor`, the thread state machine —
against rival policies in a world with known ground truth. Every ordering
below is pinned by a test; same seeds, same numbers, on any machine.

60 days · 20 proposals/day · 60 human-minutes/day · 5 seeds:

| policy | unblocked | incidents | human minutes | queue at end | unblocked/hour |
|---|---|---|---|---|---|
| `all_auto` (the 2023 agent) | **163.8** | **88** | 0 | 0 | ∞ |
| `all_consent` (everything waits) | 90.2 | 5 | 3600 | **480** | 1.5 |
| `pyramid` | 147.6 | 6.2 | 2336 | 4 | 3.79 |
| `pyramid + governor` | 152.4 | 6.0 | 2241 | 4 | **4.08** |

The pyramid unblocks **+64% more subjects than all-consent, with fewer
human minutes, at nearly the same safety** — and all-auto's throughput
crown costs 14× the incidents.

Under drift (a promoted kind turns rotten at day 30), the cliff halves the
damage vs promotion-without-demotion (34.2 vs 65.4 bad fires) — and, a
result that surprised us and is pinned as such in the tests: it lands *at
or below* the never-promoting static pyramid, because vetoes and
rejections feed the failure record too.

Outreach, 500 counterparts with a hidden preferred channel and a patience
threshold: the thread law gets **3× the replies of the naive hammer with
half the messages and structurally zero social damage** (298 replies /
1186 messages / 0 annoyed, vs 105 / 2475 / 1975).

What the closed world proves: the orderings, under stated assumptions.
What it cannot prove: the assumptions. Production keeps the final word —
a simulation win is a license to run the real experiment, never a
substitute for it.

## The dashboard — `subsidium/ui`

The kernel is the intermediary. You declare the host system (channels,
actions, subjects, a queue). The visual layer is built from that — you
do not redraw Approvals / the pyramid / an escalation briefing for every
business. Drop the bricks in your own app:

```ts
import 'subsidium/ui/styles.css'
import { EscalationBriefView, TierBands } from 'subsidium/ui'
import { deriveTier, whyEscalated, bandByTier } from 'subsidium'
```

- **`TierBands`** — the inbox, grouped from T0 (autonomous) to T5 (human).
- **`EscalationBriefView`** — the read-only page a teammate opens from a
  capability-token URL: the problem, why it rose the pyramid, the timeline.
- **`whyEscalated` / `bandByTier` / `tierMeta`** live in the kernel (pure,
  100% tested). React is a peer dependency of `./ui` only.

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
