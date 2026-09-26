# Frontend review

**Scope.** Every public page, desktop (1440×900) and mobile (375×812), on the
deployed site. Flow, positioning, hierarchy, colour, spacing, copy and state.

**Method.** Observation against the live deployment, not source reading. Each
finding names the page it was seen on.

**Date:** 26 September 2026 · **Findings: 19** · 9 fixed, no campaign blockers open

| Severity | Count |
| --- | --- |
| Blocking for the campaign | 0 |
| Fixed | 9 |
| High | 5 |
| Medium | 6 |
| Polish | 4 |

---

## Blocking for the campaign

### FE-01 · A blocked hire is a dead end
**Status: Fixed** · **Page:** `/hire/[chain]/[token]`

When an agent fails its live probe the page renders a red notice and then
roughly two thirds of empty viewport. No alternatives, no link back to the
category, no way to be told when it recovers.

The Set and Earn quest asks a wallet to hire in **all four categories**. A user
sent here by that quest has no next step on Pokter and will go and finish the
leg on another shortlisted marketplace. This is the single highest-cost screen
in the product right now.

**Fixed.** The blocked page now lists same-category agents with a record of
answering, ranked by the share of probes they answered, with an explicit empty
state when the category has none.

Built from the category listing and the local probe record only. Resolving a
dossier per candidate would mean a live probe each, which turns a dead end
into a slow dead end. The heading therefore says agents that *have been*
answering rather than implying a promise about this second.

### FE-02 · The permission stage is fully interactive and does nothing
**Status: Fixed** · **Page:** `/hire/[chain]/[token]`

Stage 1 renders a spend-limit field, day/week/month selector and a 1/7/30-day
expiry picker — then, below them, *"Delegated access is paused… No wallet
permission will be created."*

A user configures a cap and an expiry that cannot be used. The pause is correct
(POK-023), but presenting a live control above the notice that voids it is the
kind of thing a judge reads as broken rather than careful.

**Fixed.** The notice moved above the controls and now governs them, and the
block below is labelled *Preview · what a session would grant*. The controls
stay visible because what a session *would* grant is the most useful thing on
the page — they simply no longer look like a decision waiting to be made.

The copy also points at the path that does work: step 2 pays for a single job
and never touches standing authority.

### FE-03 · The network is not stated on mobile
**Status: Fixed** · **Page:** all, mobile header

The `BNB Chain · 56` pill is desktop-only. Phase 2 states plainly that the
network must be stated clearly and that *"not stated on the page counts against
you."* On a phone it is absent from the header entirely.

**Fixed together with FE-05**, since both lived in the same element. The pill
is no longer hidden below 640px, and it now names the escrow network first —
money moves there — with the registry chain appearing alongside it on wider
screens.

**Verified** at 375px: the header reads `BSC testnet`, and at desktop width
`Agents chain 56 · BSC testnet`.

---

## High

### FE-04 · A testnet balance is priced in dollars
**Status: Fixed** · **Page:** `/hire/[chain]/[token]` · spend limit

The cap reads `0.05 ≈ $38.68 tBNB per week`. Testnet BNB has no value, so the
conversion is meaningless and the two halves contradict each other in one line.

Mine, from POK-005.

**Fixed.** `formatCapUsd` returns null on testnet before it looks at a price.
The price of a token nobody sells is nothing, and the honest rendering of
that is no figure at all. **Verified:** testnet returns null, mainnet still
returns `$12.00` for a 0.02 cap at $600.

### FE-05 · Two different chains are stated in one viewport
**Status: Fixed** · **Page:** `/hire/[chain]/[token]`

The header says `BNB Chain · 56` while the body says
`BSC testnet (chain 97). Real transactions, real on-chain permissions, no real
money.` Both are true — agents are read from mainnet, escrow runs on testnet —
and nothing on screen says so.

**Fixed.** The header states both with their roles rather than one bare
number, and `NETWORK_LABEL` comes from the same source the hire page uses, so
the two cannot drift apart again.

### FE-06 · "Proven" and "Not responding" sit side by side, unexplained
**Status: Fixed** · **Pages:** `/agents/[chain]/[token]`, `/hire/[chain]/[token]`

The badges are adjacent and appear to contradict. One is an accumulated
verdict, the other is this second's probe — a distinction the product cares
about more than anything, and the one place it is not drawn.

**Fixed.** The header now reads `EVIDENCE · Proven` and
`RIGHT NOW · Not responding`, and the live state says *Answering* rather than
*Live*, which was the word doing most of the ambiguity. The hire page's badge
is labelled the same way.

### FE-07 · Counters animate constants, producing false intermediate values
**Page:** `/` ecosystem panel

The four figures count up from zero on scroll. `4 financial categories` is a
constant, and animating it renders `1 financial categories`, `2 financial
categories` on the way. Grammatically wrong, and a screenshot mid-scroll
captures a false number on a page arguing its numbers can be trusted.

**Fix.** Do not animate constants. Pluralise labels from their value.

### FE-08 · Long agent names break mid-word
**Status: Fixed** · **Pages:** `/agents`, `/categories/[category]`

`mandaterebalance-agent` renders as `mandaterebala / nce-agent`.
`marketplace-operated-grid-planner` takes three lines and still clips. Card
heights then disagree across a row.

**Fixed.** Titles clamp to two lines with the full name kept in the tooltip,
applied across the agent card, match card, alternatives and the rejection
list. These are identifiers rather than prose, so bounding them is truer than
letting them run.

Card heights now agree across a row, which was the larger of the two
complaints. A genuinely unbreakable token — `babycaisubagent9_sharp9457` —
still breaks mid-word, because it has no break opportunity and the only
alternatives are overflowing or truncating harder. Bounded and uniform is the
right trade.

---

## Medium

### FE-09 · The product's entry point is four screens down
**Status: Fixed** · **Page:** `/`

"What are you trying to do?" — Earn / Trade / Protect / Rebalance — is the
actual doorway, and it sat below the hero, the stats, the problem panel and
the live-proof table. Campaign traffic lands cold and had to scroll a long way
to act.

**Fixed.** It now sits directly under the hero, at 825px against a 768px
viewport — one scroll rather than four. The scale, the problem and the live
proof still follow, and they read better as justification for a choice already
on screen than as a prerequisite for reaching one.

### FE-10 · The hero's loudest element is a failure
**Page:** `/`

`Hiring blocked` is the highest-contrast card in the illustration: red border,
upper right, against calm greens. On-message, but it is the first thing the eye
lands on in a frame meant to invite.

### FE-11 · Live proof reads as "everything is broken"
**Page:** `/` live proof

Four `FAIL` rows to one `ANSWER`. Honest, and the ratio is real — but the panel
is meant to show *rigour*, and currently shows *desolation*. A short line
naming what the ratio means would turn it.

### FE-12 · Two probe counts on one screen, both unlabelled
**Page:** `/agents/[chain]/[token]`

`276 probes` in the stat row, `352 probe(s)` in the rationale below. One is
Pokter's record, the other the attestation's. Nothing says which.

### FE-13 · Compare promises a highlight it often cannot show
**Page:** `/compare`

The intro says the best value in each row is highlighted. With two proven
agents most rows tie, so nothing highlights and the promise reads as broken.

### FE-14 · The recovery control is described before it exists
**Page:** `/my-agents`

The copy mentions recovering a job by ID, but the control only appears once a
passkey is connected. Disconnected visitors are told about something they
cannot see.

---

### FE-19 · Alternatives can be three near-identical clones
**Status: Fixed** · **Page:** `/hire/[chain]/[token]` · found by fixing FE-01

The first live render offered BORT Yield Weaver #10997, #10967 and #10937 —
the same family three times. Technically three distinct registry entries with
strong records, but not three choices.

`collapseClones` runs on the category listing and did not group these, so
their descriptions must differ enough to pass it. Offering variety matters
more here than in a list, because this is the screen where a user has already
been refused once.

**Fixed.** One agent per publisher first, then fill from what is left. Order
within each pass is preserved, so the best agent from each publisher still
leads and nothing is promoted over a stronger record elsewhere.

**Verified:** yield now leads with `DeFiMatrix.agent` before the BORT family,
and grid-trading returns three different owners. Yield still shows two BORT
entries after the distinct publishers run out, which is the intended fallback
rather than a gap — only two publishers there have agents that answer.

---

## Polish

### FE-15 · Pool-check sliders are blue in a gold product
**Page:** `/pool-check` — the only blue accent in the interface.

### FE-16 · `(s)` pluralisation
**Pages:** agent detail, methodology — `attestation(s)`, `probe(s)`,
`measurer(s)`, `day(s)`.

### FE-17 · Discover's primary action sits at the far bottom-right
**Page:** `/discover` — *Find agents* is correct but low; the eye finishes the
form at the left.

### FE-18 · Three of four leaderboard awards go to one agent
**Page:** `/leaderboard` — data, not a defect, but it undercuts the section's
argument that different agents lead on different metrics. A line acknowledging
a sweep would keep the point intact.

---

### FE-20 · The header wrapped between 768 and 1200px
**Status: Fixed** · **Page:** all · introduced by fixing FE-03

Making the network pill always visible and adding the registry chain from
640px pushed the pill onto two lines and dragged every nav link with it. The
header measured 40px of pill at 1024px where it should have been 25.

**Fixed.** The registry chain now appears only from 1280px, and both the pill
and the nav are `whitespace-nowrap`. The escrow network is the part that must
always be legible, so it is the part that never moves.

Recorded rather than quietly corrected: it was a regression from a fix in this
same review, and a register that only lists other people's mistakes is not
being kept honestly.

---

## What is working

Worth recording, because a list of defects misrepresents the product.

- **`/methodology`** is the strongest page. Weights, the two permanently
  unscored dimensions, and the rescaling rule are stated plainly.
- **`/pool-check`** does something no competitor does, and refuses to project a
  benefit it cannot compute.
- **`/agent-advantage`** leads with the result that is least flattering.
- Evidence badges, provenance and freshness are consistent everywhere.
- Mobile type, spacing and the bottom navigation hold up well.
- The blocked-hire refusal itself is correct — only its aftermath is a gap.
