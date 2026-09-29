# Pokter mobile product audit

Inspection pass before any mobile implementation work. Every number here was
measured against the running application at 320px, not estimated.

Method: routes rendered in a 320x780 viewport against the live dev server with
real registry data; per-route counts of horizontal overflow, interactive
elements under 44px tall, and rendered text under 12px; page heights in
viewport multiples. Protocol behaviour read from source, not inferred.

---

## 1. Two findings that change the brief

### 1.1 Delegated execution does not exist, and must not be implied

The brief proposes `Discover → Understand → Compare → Hire → Permit → Fund →
Monitor → Review / Revoke`. The **Permit** stage is not available for three of
the four categories, by deliberate design.

`src/lib/altana/permissions.ts` throws for any category with allowed contracts:

> Delegated write sessions are disabled: recipient and asset constraints are
> not yet enforced on-chain.

`CATEGORY_INTEGRATIONS` shows the blast radius:

| Category | Contracts | Delegated session |
| --- | --- | --- |
| Rebalancing | PancakeSwap V3 Position Manager | **Throws** |
| Grid Trading | PancakeSwap V3 Router | **Throws** |
| Yield Optimisation | PancakeSwap V3 Router | **Throws** |
| Health Factor | none (read-only) | Not created; no authority needed |

The reason is sound: those router and position-manager calls carry recipient
parameters, and allowing the selector without constraining the arguments would
let a session route proceeds away from the user's account. It fails closed.

The mobile product must therefore **not** ship a permission-granting step for
those categories. What actually moves money today is the ERC-8183 escrow job:
the user funds a job in `$U`, the agent delivers, the buyer settles. That is a
commissioning flow, not a delegation flow.

This is an asset, not a hole. Per §8 and §23, mobile should make the conservative
behaviour read as intentional. The honest wallet-screen answer to "which agents
have authority over anything?" is *none can, and here is why* — which is a
stronger and simpler screen than the one the brief anticipated.

### 1.2 This is not a responsiveness job

**No route horizontally scrolls at 320px.** The responsive base is already
sound, so the work is not "make it fit". It is information architecture, touch
ergonomics, and progressive disclosure.

---

## 2. Measurements at 320px

| Route | H-scroll | Screens tall | Taps <44px | Text <12px |
| --- | --- | --- | --- | --- |
| `/agents` | no | — | 36 | 196 |
| `/discover` | no | — | 42 | 48 |
| `/compare` | no | — | 32 | 8 |
| `/leaderboard` | no (table overflows its wrapper) | — | 34 | 43 |
| `/my-agents` | no | — | 19 | 9 |
| `/agents/56/265375` | no | **7.4** | 33 | 77 |
| `/hire/56/265375` | no | **5.4** | — | — |

Three things stand out.

**Agent detail is 5,799px of scroll** across 8 full-detail sections (Try the
agent, Why trust, Performance, Watch it work, Track record, Receipts,
Permissions, How measurers could be wrong). This is the single most important
decision screen in the product and it is a document, not a decision surface.
Everything is rendered at §10's Level 3 simultaneously; there is no Level 1.

**Touch targets fail broadly.** 19–42 sub-44px controls per route. Hire's number
inputs are 34px tall — these are the fields where a user types how much money to
commit.

**196 text nodes under 12px on `/agents` alone**, some at 10px. Density tuned
for a desktop monitor read at arm's length.

Other observations: `/leaderboard` renders a `<table>` that overflows its
container (§6's squeezed-table failure); `/hire` takes ~6s to become useful and
shows only the text line "Loading current protocol data…" with the full site
footer beneath it; `/hire` renders the heading "Commission work" twice.

---

## 3. Route-by-route disposition

### KEEP
- **Service worker** (`public/sw.js`). Navigations are network-first with an
  offline fallback; API, balance and transaction routes are never cached; build
  output is cache-first only because it is content-hashed; brand assets are
  stale-while-revalidate. This is already correct per §18 and any §19 caching
  work must not weaken it.
- **Manifest** (`src/app/manifest.ts`). `standalone`, `start_url: /app`, scope,
  theme/background, maskable icons, shortcuts. Complete.
- **`viewportFit: 'cover'`** plus the safe-area CSS. Correct foundation.
- **`prefers-reduced-motion`** is honoured in four places including `CountUp`.
- **The domain model.** Categories, verdicts, the five scored dimensions, and
  the null-vs-zero distinction in `DimensionScore` (unmeasured is not the same
  as failed) are exactly the honesty the brief asks for. Presentation changes
  must preserve that distinction.
- **`/my-agents`** structurally — lowest tap-target debt, closest to app-like.

### IMPROVE
- **`/agents`** — right concept, wrong density. Cards carry registry fields that
  do not drive a tap decision.
- **`/compare`** — already the least text-dense route; needs the mobile
  row-label pattern from §6 rather than a table.
- **Tab bar** (`Nav.tsx`) — floats and pins correctly; label set is wrong (below).
- **`/discover`** — 42 sub-44px targets, and two anchors overflow their box.

### REDESIGN
- **`/agents/[chainId]/[tokenId]`** — 7.4 screens. Needs §10's three levels:
  verdict first, one-sentence evidence summary second, full provenance behind
  disclosure. This is the highest-value single change in the project.
- **`/hire/[chainId]/[tokenId]`** — 5.4 screens, 6s blank, 34px money inputs,
  duplicated heading. Should become a short guided flow whose review screen is
  unambiguous, and whose permission section states the paused-delegation reality
  rather than presenting a grant UI.
- **`/leaderboard`** — the table cannot survive 320px. Ranked list of cards.

### REMOVE (from the installed app's primary surface, not from the site)
- **`/pool-check`** and **`/agent-advantage`** — research/analysis surfaces.
  Reachable, not primary.
- **`/methodology`** — belongs behind evidence disclosure at the point of use.

### MISSING
- **A bottom-sheet / dialog primitive.** The only dialog-ish component is
  `ProvenanceTag`. §27 and §20 both need one with focus trapping.
- **Route-level skeletons.** Only `/` and `/discover` have `loading.tsx`. The
  slow routes — agent detail, hire, leaderboard — have none.
- **Search as a destination.** `AgentSearch` exists as a component; there is no
  search surface with recent queries, filters, or match explanations (§4).
- **A wallet/control screen.** No surface answers "where is my money and what
  has authority over it".
- **Distinct empty/error states.** §15 wants six states kept apart (loading, no
  results, registry unavailable, network unavailable, no evidence, endpoint
  offline). Not systematically present.
- **Per-route error boundaries.** One global `error.tsx`; a registry failure and
  a bad token id are not distinguished.

---

## 4. Proposed mobile information architecture

Five destinations, chosen against user intent rather than existing routes:

| Tab | Answers | Backing |
| --- | --- | --- |
| **Home** | What should I care about now? | `/app` |
| **Discover** | What agents exist, and which should I investigate? | `/agents` + categories |
| **Search** | Find a specific thing | new surface over `AgentSearch` |
| **Activity** | What did my agents do? | `/my-agents` + jobs |
| **Wallet** | Where is my money, what has authority? | new |

Changes from today's installed set (`Home · Discover · Agents · Activity`):
`Discover` and `Agents` are currently two tabs answering one question — merge
them and reclaim a slot. Add `Wallet`, which has no home today. Add `Search`.

Current tab-bar labels also disagree with the routes they point at: the tab
labelled "Activity" goes to `/my-agents`, and "Discover" and "Agents" are
distinct destinations whose difference is not expressible in one word.

Desktop navigation and the desktop information architecture are unchanged
throughout. Every change below is scoped to phone widths or to the installed
PWA context.

---

## 5. Sequenced plan

Ordered by user-visible value per unit of risk. Each stage ships independently.

1. **Primitives** — bottom sheet (focus-trapped), skeletons, empty/error states,
   a single evidence-status component, sticky action bar. §27's anti-duplication
   requirement: refactor toward these rather than adding variants.
2. **Agent detail redesign** — the 7.4-screen problem, via three-level
   disclosure. Highest value.
3. **Touch and type pass** — 44px minimums, lift sub-12px text, money inputs
   first.
4. **Hire flow** — guided stages, honest permission section, review screen,
   skeleton instead of the 6s text line.
5. **Leaderboard and compare** — de-table both.
6. **Navigation change** — merge Discover/Agents, add Search and Wallet.
7. **Wallet/control surface** — new.
8. **Freshness labelling** — only where it cannot make cached balances or
   permissions look live.

## 6. Risks

- **Honesty regressions.** The two traps are implying delegated authority exists,
  and collapsing "unmeasured" into "zero". Both are currently modelled correctly
  and are easy to lose in a presentation refactor.
- **Desktop bleed.** The user's constraint is that desktop must not change.
  Mobile-only CSS and `md:` breakpoints; verify both widths per change.
- **Cache safety.** §19's freshness labelling pushes against the SW's current
  refusal to cache protocol reads. Discovery data may be cached; balances,
  permissions and job state may not.
- **Scale.** Today's registry is ~32 indexed agents. The brief asks about
  10,000+. List virtualisation is out of scope now but the card component should
  not make it harder later.
