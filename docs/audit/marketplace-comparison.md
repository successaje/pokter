# Marketplace comparison — what to take from Apify

Measured against https://apify.com/store and an Actor detail page at 390px and
1280px, plus Dolphin's agent page. Numbers here were read from the running
sites, not estimated.

## What the comparison actually showed

Apify's advantage is not a visual effect. It is that complicated software is
packaged like a familiar app marketplace. The measurable difference is type.

| | Apify | Pokter (before this pass) |
| --- | --- | --- |
| Body text | 18px | 16px declared, but components use `text-[11px]` 47×, `text-[10px]` 23× |
| Heading | 52px, weight 400, normal tracking | 30px, weight 600, −0.75px tracking |
| Card | `#1d1d1d` on `#020202`, **no border**, 8px radius | bordered box, 12px radius |
| Card hover | `box-shadow: 0 0 0 2px` ring | border colour change |
| Card height | 170px, fixed at every width | 155–263px |

Pokter carries hierarchy with borders, small type and semibold tight tracking,
which reads as a dashboard. Apify carries it with size and surface, which reads
as a product.

Two corrections to note, because both were asserted in review and neither
survived measurement:

- Apify does **not** rely on borders more than shadows. Its cards have
  `border: 0px` and no shadow; separation is surface lift alone.
- Apify's mobile store has 40 controls under 44px. Pokter has 0–3. We are
  ahead on touch ergonomics and should not regress to match.

## Already built — not on the list

- Result counts and removable filter chips (`AgentSearch` renders both).
- Related/alternative agents (`recommendedAlternatives` → `Alternatives`).
- Skeletons matching final dimensions, and separated empty / no-evidence /
  endpoint-offline / registry-unreachable states.

## Deliberately not taking

- **Star ratings and a parallel review system.** `docs/phase-2/tracking.md`
  states the position: Pokter does not operate a star-rating system because
  the buyer's on-chain settlement is the only rating backed by money. A
  subjective review track does not sit beside that claim, it competes with it.
- **Usage counts as a trust signal.** Adoption is not evidence. "408K runs" is
  exactly the convincing-versus-good confusion this product exists to expose.
  A volume signal here should be probes or settled jobs.
- **A 23-screen README detail page.**
- **"List an agent" as a campaign-critical build.** It was argued as the
  largest missing feature relative to the quest. The tracked events in
  `tracking.md` §2 are hire, deposit, completion and settlement verdict —
  there is no listing event, and Pokter mints nothing by design. Possibly good
  product; not quest-critical.

## This pass

Visual and structural only. No protocol logic changes.

1. **Type ramp.** Raise the floor everywhere, not only on phones. The mobile
   floor already lifted 9–11px values below 768px; desktop is still dense.
2. **Surfaces over borders.** Separate cards by background lift, keep one
   radius, and move hover to a ring so nothing shifts on interaction.
3. **Card hierarchy.** One scan order: what it does, can I trust it, is it
   answering, what does it cost, can I hire it. Everything else on the dossier.
4. **Publisher identity.** `owner_address` is already on every listing, so a
   shortened owner belongs on the card and in the header. Note that
   `collapseClones` keys on description, not owner, so "same publisher"
   grouping is new work — small, but not free.
5. **Readable identity and copy controls.** Lead with a name, not
   `#265375 · chain 56`; make the identity, owner, endpoint, job id and tx
   hashes copyable with a specific confirmation.

## Deferred, with the reason

- **Tabbed dossier.** Converged on from both reviews, but it partly undoes the
  disclosure work that took agent detail from 7.4 to 3.4 screens. Tabs suit
  reference a user returns to; accordions suit first-read triage. Decide
  deliberately rather than layering both.
- **"Ask Pokter about this agent."** Strongest idea for making the evidence
  legible, and the one that puts a generative surface inside a product whose
  pitch is that it never fabricates. A wrong answer here is shaped like
  financial advice. Gate it behind every claim carrying a link to the evidence
  it came from.
- **Publisher profiles, watchlists, builder flow, input schemas.** Real
  features, not styling. Separate passes.
