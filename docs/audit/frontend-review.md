# Frontend review

**Scope.** Every public page, desktop (1440×900) and mobile (375×812), on the
deployed site. Flow, positioning, hierarchy, colour, spacing, copy and state.

**Method.** Observation against the live deployment, not source reading. Each
finding names the page it was seen on.

**Date:** 26 September 2026 · **Findings: 18**

| Severity | Count |
| --- | --- |
| Blocking for the campaign | 3 |
| High | 5 |
| Medium | 6 |
| Polish | 4 |

---

## Blocking for the campaign

### FE-01 · A blocked hire is a dead end
**Page:** `/hire/[chain]/[token]` · **Seen on:** Beefy powered by HeyAnon

When an agent fails its live probe the page renders a red notice and then
roughly two thirds of empty viewport. No alternatives, no link back to the
category, no way to be told when it recovers.

The Set and Earn quest asks a wallet to hire in **all four categories**. A user
sent here by that quest has no next step on Pokter and will go and finish the
leg on another shortlisted marketplace. This is the single highest-cost screen
in the product right now.

**Fix.** Offer the same category's passing agents inline, ranked. The refusal
is right; the dead end is not.

### FE-02 · The permission stage is fully interactive and does nothing
**Page:** `/hire/[chain]/[token]`

Stage 1 renders a spend-limit field, day/week/month selector and a 1/7/30-day
expiry picker — then, below them, *"Delegated access is paused… No wallet
permission will be created."*

A user configures a cap and an expiry that cannot be used. The pause is correct
(POK-023), but presenting a live control above the notice that voids it is the
kind of thing a judge reads as broken rather than careful.

**Fix.** Collapse the controls behind the paused state, or disable them
visibly, so the notice governs what is above it rather than contradicting it.

### FE-03 · The network is not stated on mobile
**Page:** all, mobile header

The `BNB Chain · 56` pill is desktop-only. Phase 2 states plainly that the
network must be stated clearly and that *"not stated on the page counts against
you."* On a phone it is absent from the header entirely.

**Fix.** Keep a compact network indicator in the mobile header.

---

## High

### FE-04 · A testnet balance is priced in dollars
**Page:** `/hire/[chain]/[token]` · spend limit

The cap reads `0.05 ≈ $38.68 tBNB per week`. Testnet BNB has no value, so the
conversion is meaningless and the two halves contradict each other in one line.

Mine, from POK-005. The USD figure belongs on mainnet only.

### FE-05 · Two different chains are stated in one viewport
**Page:** `/hire/[chain]/[token]`

The header says `BNB Chain · 56` while the body says
`BSC testnet (chain 97). Real transactions, real on-chain permissions, no real
money.` Both are true — agents are read from mainnet, escrow runs on testnet —
and nothing on screen says so.

**Fix.** Name the two roles where they appear: the registry chain in the
header, the escrow chain at the point of signing.

### FE-06 · "Proven" and "Not responding" sit side by side, unexplained
**Pages:** `/agents/[chain]/[token]`, `/hire/[chain]/[token]`

The badges are adjacent and appear to contradict. One is an accumulated
verdict, the other is this second's probe — a distinction the product cares
about more than anything, and the one place it is not drawn.

**Fix.** Label them: *Evidence: Proven* and *Right now: not responding*.

### FE-07 · Counters animate constants, producing false intermediate values
**Page:** `/` ecosystem panel

The four figures count up from zero on scroll. `4 financial categories` is a
constant, and animating it renders `1 financial categories`, `2 financial
categories` on the way. Grammatically wrong, and a screenshot mid-scroll
captures a false number on a page arguing its numbers can be trusted.

**Fix.** Do not animate constants. Pluralise labels from their value.

### FE-08 · Long agent names break mid-word
**Pages:** `/agents`, `/categories/[category]`

`mandaterebalance-agent` renders as `mandaterebala / nce-agent`.
`marketplace-operated-grid-planner` takes three lines and still clips. Card
heights then disagree across a row.

**Fix.** `overflow-wrap: anywhere` with a hyphen hint, a line clamp, and a
fixed minimum card height.

---

## Medium

### FE-09 · The product's entry point is four screens down
**Page:** `/`

"What are you trying to do?" — Earn / Trade / Protect / Rebalance — is the
actual doorway, and it sits below the hero, the stats, the problem panel and
the live-proof table. Campaign traffic lands cold and has to scroll a long way
to act.

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
