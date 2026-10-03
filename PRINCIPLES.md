# The principles — canonical, priced, pinned

Every law in subsidium follows the same contract: a **statement** you can
say out loud, an **origin** (someone paid for this lesson before us — often
us), the **primitive** that enforces it (a law that lives only in prose is
a suggestion), the **test** that pins it, and the **price** — the measured
number that says what ignoring it costs. If a claimed principle is missing
one of the five, it is not a principle yet; it is an opinion.

Numbers marked *sim* come from the closed world (`npm run sim` — seeded,
deterministic, pinned by tests; see the README). Numbers marked *prod* were
measured on the production system this kernel was extracted from, or on its
sibling repo [`panarchy-llm`](https://github.com/loic001/panarchy-llm),
which is the conceptual ancestor: same doctrine (oracle, governor, reframe,
closed-world proof), different substrate. Subsidium shares no code with it —
it shares the *lessons*, and cites its measurements where they apply.

---

## The pyramid

### 1. Escalation bears the burden of proof

Subsidiarity, the political principle (Aquinas → EU treaty art. 5(3)),
applied to attention: the default locus of action is the LOWEST tier, and
moving a decision UP must be justified — never the reverse. A system that
asks by default trains its human to rubber-stamp.

- **Primitive:** `deriveTier` returns `reasons` — structurally non-empty
  for every tier above 0 ([`src/tier.ts`](src/tier.ts)).
- **Pinned by:** the exhaustive 12-cell table test + "every tier above 0
  carries reasons".
- **Price** (*sim*): all-consent unblocks 90.2 subjects for 3600 human
  minutes; the pyramid unblocks 147.6 for 2336. Asking about everything is
  not safety — it is throughput divided by 1.6 at a *higher* attention bill.

### 2. The discriminator is who holds the fallback

Tiers are not "how much the AI does" (SAE J3016's lesson: what separates
level 2 from level 3 is who must catch the failure). `TIER_MODE` names the
fallback holder at each tier: silent automation, notified human, veto
window, explicit consent, human decision, out of scope.

- **Primitive:** `TIER_MODE` ([`src/types.ts`](src/types.ts)).
- **Pinned by:** the surface test locks all six modes in pyramid order.

### 3. A tier is derived, never chosen

Three objective properties — reversibility, external visibility, Cynefin
domain — produce the tier. Never a model's confidence score (uncalibrated,
wrong axis), never a human's mood, never the action's *name*. Monotonicity
makes it un-gameable: re-describing an action can never lower its tier.

- **Primitive:** `deriveTier` + `tierInput` ([`src/tier.ts`](src/tier.ts)).
- **Pinned by:** all 12 input cells + three monotonicity laws (losing
  reversibility, gaining visibility, hardening the domain never lower).
- **Corollary — T5 is declared, never derived:** the classifier tops out
  at T4. No property combination proves "the system must not even prepare
  this"; out-of-scope is a host decision about a whole kind (fire someone,
  sign a contract). The pyramid shows six tiers; the classifier emits five.

### 4. The oracle, not vibes

An action carries `verify` — a check against the REAL system on FRESH data,
run just before `execute`. An action whose verify always says yes is a
turkey: it accumulates a perfect track record right up to the day it
matters (the sibling repo's founding lesson).

- **Primitive:** `ActionSpec.verify` ([`src/types.ts`](src/types.ts)); the
  gate pattern in [`examples/gate-an-agent.ts`](examples/gate-an-agent.ts).
- **Price** (*prod*, panarchy-llm): oracle-verified moves 98% success vs
  90% for trust-the-plan escalation on the same tasks.

## Trust

### 5. Promotion is earned, demotion is a cliff

An action kind runs one tier below its derived tier only after `minTrack`
executions under an error budget (the Kubernetes operator maturity lesson:
Deep Insights before Auto Pilot). One human contest — "this needed me" —
snaps it back instantly and stickily. Asymmetry is the point: trust climbs
stairs and takes the elevator down.

- **Primitive:** `TierGovernor` ([`src/governor.ts`](src/governor.ts)).
- **Pinned by:** fuzzed invariant (n=500 seeded sequences): effective tier
  is always derived or exactly one below, never lower.
- **Price** (*sim*): under drift (a promoted kind turns rotten at day 30)
  the cliff halves bad fires vs promotion-without-demotion, 34.2 vs 65.4.
- **Corollary — the yellow card is evidence, never a lever:** "this did
  not need me" (`contestDown`) is recorded for the human review and moves
  nothing automatically. You do not reach autonomy by reclassifying what
  gets counted. Pinned: contests-down change no tier.
- **Corollary — the contest is an alarm, not a criminal record:** the
  cliff waits for a deliberate review (`reset`), and the review's verdict
  replaces the alarm — trust re-earns from zero track, but the promotion
  bar does not climb forever. Without this, one caught bad fire on a
  99%-good kind freezes its trust for good, and the system cannot
  converge (*sim*: last-3-weeks attention 141 min/week with the review
  vs 185 frozen without, static pyramid 308 — the human week shrinks
  ~40% and converges toward the irreducible complex core).

- **Streak healing** (`healing: 'streak'`): the review above assumes someone
  holds it. Where nobody does, a demoted kind never comes back, and the
  consent queue expires faster than it is read (*measured on the reference
  host, 2026-10*: 7 kinds of 9 demoted for weeks, more merchant messages
  expired than sent). In streak mode a kind is promoted after `minTrack`
  consecutive clean executions and one contest or failure puts the streak
  back to zero. The cliff stays; the way back up no longer needs a meeting.

### 6. Trust belongs to the version

The governor key of a SOP includes its version: edit the procedure and the
track record restarts at zero. Otherwise a trusted *name* inherits trust
its new *body* never earned — the same door Goodhart uses (keep the label,
change what it does).

- **Primitive:** `sopGovernorKey` ([`src/sop.ts`](src/sop.ts)).
- **Pinned by:** key uniqueness across versions in `sop.test.ts`.

## Conversation

### 7. Our own voice is not engagement

Systems that ingest their own messages count themselves as replies. Every
engagement counter passes an authorship predicate, FAIL-CLOSED: "I don't
know who spoke" never counts as "the counterpart replied".

- **Primitive:** `countsAsReply` ([`src/thread.ts`](src/thread.ts)) —
  only `side: 'them'` counts; `null`/`undefined` count as no.
- **Pinned by:** `thread.test.ts` (us-side and unknown speakers never feed
  `counterpart_replied`).
- **Price** (*prod*): 81% apparent reply rate, 11% real — the most
  expensive dashboard lie this framework's authors ever shipped.

### 8. Reframe, never force

With a human counterpart, resampling is not free: repetition has a punitive
social cost. A stalled thread is never re-nudged identically — the next
move changes the channel, the counterpart, or the question, or closes the
thread (Bateson: more force at the same logical level never works).

- **Primitive:** `nextMove` / `transition` / `pickReframe`
  ([`src/thread.ts`](src/thread.ts)).
- **Price** (*sim*): 3× the replies of the naive hammer with half the
  messages and structurally zero social damage (298 replies / 1186 messages
  / 0 annoyed, vs 105 / 2475 / 1975). (*prod*, panarchy-llm: decomposition
  98% vs escalation 90%.)

## The human tier

### 9. Errors ascend compressed

The tier above needs what failed and what was tried — never the raw history
(Beer's algedonic signal; Friston: transmit prediction *errors*, not
states). Handing a human the full dump spends their attention on reading
instead of deciding.

- **Primitive:** `buildEscalationSignal` + `MAX_SUMMARY_LENGTH`
  ([`src/escalation.ts`](src/escalation.ts)).
- **Pinned by:** length bound enforced structurally in tests.

### 10. Attention is a budget, not a firehose

The human tier has minutes per day and minutes per item. When they are
spent, escalations queue; they do not spill — an overflowing inbox teaches
its owner to ignore all of it. A budget that can never admit a single item
throws at first use: a silent infinite queue wearing the costume of a tight
budget is a turkey.

- **Primitive:** `admit` / `rollover` ([`src/attention.ts`](src/attention.ts)).
- **Pinned by:** pathological-config tests (throws, never degrades).
- **Host lesson (a real bug, shipped once):** if the host persists its
  queue elsewhere (a proposals table) and a cron re-asks every tick,
  persist the ADMITTED state only — persisting refusals inflates `queued`
  with phantoms and pre-spends tomorrow's budget. Documented at the
  primitive itself.

## Procedures & numbers

### 11. Weakest link

A chain is as dangerous as its most dangerous step. A SOP's tier is the MAX
of its steps' derived tiers — never an average, never a separate
declaration — and the verdict names the step that forced it.

- **Primitive:** `deriveSopTier` ([`src/sop.ts`](src/sop.ts)).
- **Price** (*sim*): gating chains at the average of their steps fires 240
  dangerous chains with nobody in the loop and costs 6.4× the incidents
  (52.8 vs 8.2) — while looking *faster* on every dashboard metric. That
  last clause is the trap, and it is pinned as such.

### 12. Approval follows verification

The SOP lifecycle is a one-way ladder (draft → verified → approved) and any
EDIT falls back to draft. A human approves a text they read; if the text
changed, that approval is void. Only `approved` is runnable.

- **Primitive:** `sopTransition` / `sopRunnable` ([`src/sop.ts`](src/sop.ts)).
- **Pinned by:** every illegal transition holds status; `edited` always
  returns to draft.

### 13. A number is not a claim

Three sub-laws, one judge. **A number without n is a vibe** — below `minN`
the only honest verdict is `too_early`, never "trending well". **The
definition is part of the reading** — two readings under different
definitions are `not_comparable`, full stop; Goodhart enters through
renamed denominators. **Compared to what?** — there is no single-reading
"success"; `judge` takes treated AND baseline explicitly.

- **Primitive:** `reading` / `judge` ([`src/measure.ts`](src/measure.ts)).
- **Pinned by:** `measure.test.ts` covers every verdict path.
- **Price** (*prod*): see principle 7 — the 81%/11% lie was exactly a
  definition problem (who counts as a replier).

## Executors

### 14. The pyramid classifies actions, not executors

"Where does the agent sit in the pyramid?" is a category error. The pyramid
answers *who must approve this?* — never *who does the work?*. A code
action, a managed agent (Claude, Mastra) and a SOP are all **executors**;
the human is not a stage of the pipeline but a **gate** that certain tiers
must pass. What separates a code action from an agent is the closure of
the outcome space, not complexity: if you can write `verify()` as a
precise precondition, it is code; if the path is not enumerable in
advance, it is a **mission** — and then five sub-laws apply:

- **No raw hands** — the agent touches the world only through declared,
  gated tools; an undeclared call is refused, fail closed.
- **Gate per call** — you cannot tier a plan that does not exist yet, so
  the gate sits at the tool boundary. The **mandate** is the max tier the
  agent crosses alone; above it, the call pauses and becomes an ordinary
  proposal. A mandate above T2 is a spec bug: T3 is *by definition* a
  human click.
- **A run is a dynamic SOP** — its effective tier is the weakest link
  (principle 11) over the tools it *actually* called, known only after
  the fact.
- **Trust belongs to (version × tool kind)** — never to "the agent".
  New prompt or new model → new version → track record restarts at zero
  (the same door Goodhart uses on SOPs, principle on trust-per-version).
- **Exploration → exploitation** — a mission that repeats the same path
  has *discovered* a procedure: demote it to a code action or SOP. The
  agent is the exploration phase; the code action is the fossil of an
  exploration that ended.

- **Primitive:** `gateToolCall` / `missionGovernorKey` / `missionTier`
  ([`src/mission.ts`](src/mission.ts)).
- **Pinned by:** `mission.test.ts` — undeclared tool refused, mandate
  pauses, promotion per tool kind, trust dies on version bump, weakest
  link over actual calls, mandate > T2 throws.
- **Origin** (*prod*): the reserve danger scan (2026-08-31). Reading the
  fleet is free (T0/T1), raising a merchant's reserve touches their money
  (T2), a target above the 40% cap has no right answer (T4), closing a
  merchant is refused outright (declared T5) — one mission, four gates,
  and no single tier could have priced the whole run honestly.

## The ask

### 15. An ask must be worth its minutes

The pyramid says who must approve an action. It does not say whether a
subject deserves a person at all. An ask — "can someone reach out", "please
have a look" — spends minutes of the most expensive tier, so the stake
behind it must repay those minutes several times over, in the host's own
unit. An ask that cannot name its stake has not made its case: unknown is a
refusal (principle 1 applied to the ask itself). One exception by design:
when the counterpart asked for a person, a person answers — that is a
reply, not an escalation.

- **Primitive:** `askWorth` / `gateAsk` ([`src/ask.ts`](src/ask.ts)). The
  verdict carries its arithmetic (cost, stake needed); non-positive pricing
  throws — a free human makes every ask "worth it", which is a turkey.
- **Pinned by:** `ask.test.ts` — boundary at stake = cost × return,
  monotone in minutes, fail-closed on an unproven stake, the
  counterpart-request exception, pathological pricing throws.
- **Origin** (*prod*, 2026-10-01): a merchant with $294 of volume in 90
  days (about $15 of margin), sales stopped 40 days earlier. The system
  asked the account manager, then a tech channel two days later; a lead
  engineer checked and answered "nothing blocking on our side".
- **Price:** not measured yet. The origin is n=1, which this page's own
  standard (principle 13) calls an anecdote; a closed-world scenario
  (value unblocked per human-hour, with and without the floor) is open work.
- **Order of the gates:** worth, then standing (16), then the attention
  budget (10). A budget rations asks that deserved to exist; it is not a
  substitute for asking whether they did.

### 16. An ask that never pays loses its voice

Every ask kind keeps a record of what the human's time actually bought:
`paid` (their intervention changed the outcome), `not_needed`, or
`unanswered`. Once the record is long enough to be read honestly and the
yield sits under the floor, the kind stops interrupting. It is muted, not
deleted: its items go to a digest the human reads on their own schedule,
and a deliberate review (`reviewAsk`) restarts the record — the mute is an
alarm, not a criminal record (same contract as principle 5).

- **Primitive:** `recordAsk` / `askStanding` / `reviewAsk`
  ([`src/ask.ts`](src/ask.ts)).
- **Pinned by:** `ask.test.ts` — below `minN` the kind is `unproven` and
  may ask (it must earn a record somehow); boundary at the floor; review
  restarts from zero; a floor of zero throws (it never mutes anything).
- **Price** (*prod*): in a ten-day audit of the system this kernel was
  extracted from, 63 internal asks produced 4 unblocks (6%). The other 59
  were a dead file, a counterpart who had left, the ball in the
  counterpart's court, a normal delay not yet elapsed, or a colleague
  already on it.
- **Not a lever on autonomy:** muting grants the system nothing. The action
  behind an ask keeps its derived tier; only the interruption is withheld.
  This is why it does not contradict the yellow-card corollary of
  principle 5 — nothing here lets the system *do* more, it only makes it
  *ask* less.
- **Host note:** yield belongs to the ask's wording and trigger. If either
  changes, key the record on the new version, as with SOPs (principle 6).

---

## What this page cannot do

The closed world proves *orderings under stated assumptions*; production
keeps the final word. When a principle here conflicts with a measurement
you made on your own system, trust your measurement — then send us the n
and the definition.
