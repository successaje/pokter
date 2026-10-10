# Pokter 2 — the rebuild

Branch `pokter2`, cut from `main` at `7c769b78` on 10 October 2026. The
backend, protocol code, stores and tests are unchanged except where noted;
the whole UI was rewritten from first principles. Research behind the
decisions: [`RESEARCH.md`](RESEARCH.md).

## Positioning

**Find agents that actually work.** Discover, compare and hire AI agents on
BNB Chain, and see the evidence behind them before you pay. It is built for
three overlapping people, under one wallet-based account:

| Person | First screen | Core path |
| --- | --- | --- |
| Customer | `/` → `/discover` | describe task → evaluate → hire → follow job → review |
| Builder | `/build` → `/studio` | idea / existing ERC-8004 / template → configure → test → register → operate |
| Operator | `/workspace` | what needs me → jobs → wallet and payments |

## Information architecture

```
Public (site layout: header, footer, phone tab bar)
  /                         Home: hero inspection, outcomes, hireable now, why, rules, how, builders, standards, trust
  /discover                 Search-first catalogue (?q ?category ?hireable ?answering ?priced ?evidence ?chain ?sort ?view ?pages), collections with live counts
  /agents/[chain]/[id]      Agent profile (overview, evidence, work and reviews, pricing, permissions, technical)
  /compare?agents=56:1,…    Up to four, table on desktop, per-measure cards on phones
  /pool-check               PancakeSwap v3 break-even calculator on live pool state
  /builders/[address]       Operator profile (registry-owned agents, verified ownership, paid work)
  /how-it-works /methodology /developers /about /support /build /set-and-earn
  /terms /privacy /risk     Legal (wording carried over from main)

Transaction flow (focused layout, no site nav)
  /hire/[chain]/[id]        Describe → Review terms → Fund escrow → Funded (→ job page)

App (sidebar shell, Workspace ⇄ Studio switch, phone tab bar)
  /workspace                Overview: needs you, in progress, finished, agents, inbox
  /workspace/jobs           Filters: all, in progress, needs you, settled, disputed or refunded (?agent=)
  /workspace/jobs/[id]      Your move (verify → read → release / dispute; reclaim), timeline, review
  /workspace/agents /saved /inbox /wallet
  /studio                   Three paths; or, with a verified owner session: fleet health, customer jobs, alerts, drafts
  /studio/new               Define → Configure → Test → Publish (?template= ?draft=)
  /studio/import            Compatibility check + ownership signature (?chainId ?tokenId)
  /studio/templates
  /studio/agents/[chain]/[id]  Health, operations (money, jobs per week, reply time, probe log), customer jobs with hand delivery, adoption, on-chain profile editor
  /account                  Wallets, security and permissions, notifications, preferences, building
```

Every URL the previous frontend published is redirected
(`next.config.ts`): `/agents`, `/categories/*`, `/leaderboard`, `/census`,
`/agent-advantage`, `/app`, `/activity`, `/my-agents`, `/saved`, `/builder`,
`/compatibility`, `/pool-check`, `/set-and-earn/guide`; `?hire=1` on an
agent page goes to `/hire/…`; `/build?chainId&tokenId` goes to
`/studio/import`. Notification e-mail links now land on `/workspace/inbox`
and `/studio`.

## Code layout

```
src/app/(site)  (app)  (flow)     route groups = layouts
src/shell/                         headers, sidebar shell, tab bar, theme, PWA, wallet connect
src/ui/                            design-system primitives (no data access)
src/features/<area>/               data assemblers (server-only) + feature components
src/lib/                           unchanged backend, plus logic moved out of the old UI:
  wallet/PasskeyProvider.tsx       (was components/wallet)
  hire/useHire.ts, hire-open.ts    (was components/hire)
  jobs/useJobActions.ts            (extracted from components/jobs/JobCard)
  home/outcome-shortlist.ts        (extracted from components/home/BrowseByOutcome)
  wallet/sponsor.ts + api/wallet/sponsor-gas   (restored: main had the client but not the route)
```

Feature data modules (`features/home/data.ts`, `features/discover/search.ts`,
`features/agent/profile.ts`, `features/studio/data.ts`) turn lib output into
serialisable view models. Agent-supplied text is stripped of control
characters and capped, URLs are rendered only when `https:`, and nothing is
ever rendered as HTML.

## Design system: Instrument

- **Ground and ink**: warm paper `#f3f1eb` / graphite `#141517`, with three
  ink steps that meet AA. Tokens are in `src/app/globals.css`, exposed as
  Tailwind colours (`bg-paper`, `text-ink-2`, `border-rule` …). Light and dark
  are both designed; `.inverse` scopes a section to dark.
- **Signal**: BNB-adjacent yellow, used for the logo's proof tile, the hire
  progress bar, focus washes, and the one money button (`intent="signal"`).
  It never means a status.
- **Evidence colours** (`ok / watch / info / bad / none`) appear only for
  measured states. Verdict glyphs differ by shape too, so they survive
  greyscale.
- **Type**: Instrument Sans (variable width and weight; display sizes run at
  `wdth 86`) and JetBrains Mono for every measurement and identifier. Both are
  self-hosted under OFL. The scale is `.t-display .t-h1 .t-h2 .t-h3 .t-lede
  .t-body .t-small .t-label .t-readout`.
- **Composition**: hairline rules instead of boxes (`.ruled`), specimen labels,
  readouts, and one 12-column hero grid. No glass, no gradients.
- **Motion**: the hero inspection paces real checks. Reveal uses CSS
  scroll-driven animation (content is never hidden by script). Sheets and
  steps use short rises. `prefers-reduced-motion` turns all of it off.
- **Primitives** (`src/ui`): Button/LinkButton/Spinner, Field/Input/Textarea/
  Select/Checkbox, Segmented/Tabs/TabLinks/Chip/Breadcrumbs, Sheet (native
  dialog, bottom sheet on phones), Notice/EmptyState/Skeleton/LoadingRegion,
  Readout/Facts/Details/Address/TxLink/CopyButton, Verdict glyph/label/chip,
  AgentAvatar (with fallback)/ProbeStrip, Reveal, and a custom icon set.

## Truthfulness rules applied in the UI

- No invented numbers anywhere. The hero, readout strip, funnel and featured
  agents are read live, and empty states say "nothing" rather than filling
  in.
- A signed quote is the only price. Otherwise it is "No signed price" plus a
  labelled suggestion.
- "Registered" is never shown as "verified". New listings start at "Not
  measured".
- Standards are shown as Live, Partial, Planned or Unavailable. x402 is
  Planned, and the ERC-8004 validation registry is Unavailable.
- There are no stars, popularity or ratings. Reviews are only those signed
  by funding wallets.
- Permissions: one escrow payment and no standing access, stated on the
  profile, in the hire review and on Account.

## Verified

- `npm test`: 238/238 pass (4 new binding tests). `npm run audit:protocol`: passes. `npm run
  lint`: clean (React purity issues fixed, not suppressed). `tsc`: clean.
  `npm run build`: succeeds, all routes emitted.
- Browser walkthrough (desktop 1366, phone 375, light and dark) of: home,
  Discover with a natural-language query, agent profile with live probe,
  hire flow describe → review → pay (wallet requested only at pay; connect
  sheet), workspace and studio empty states, studio import running the live
  compatibility check, studio create wizard from a template.
- Legacy redirects return 307 to their new homes.
- Real settled job #1352 (pre-envelope) and expired job #1372 render read-only from chain via job recovery.

## Review fixes (second pass)

A review of the rebuilt UI against the backend found 14 issues, all fixed:

- `useHire.commission()` refuses to run on an invalid budget, an unaccepted risk or an empty task, whoever calls it. The failure banner no longer offers a one-click retry that skips the confirmation.
- The payment confirmation covers amount, task **and recipient**.
- Gas sponsorship refuses foreign contract code but allows no-code addresses and EIP-7702 delegations, because a new passkey wallet's upgrade is counterfactual and lands with its first (sponsored) transaction. A first pass required code and would have refused every new passkey buyer; a second review caught that. Plain EOAs therefore remain eligible, and the abuse limits are the $U holding rule plus persistent per-wallet, per-client and daily caps. Mainnet sponsorship stays off unless explicitly enabled. Robustly identifying Pokter passkey wallets (for example, recording them at creation) is still open.
- **Quotes must bind their terms and Pokter's own brief.** `negotiationTermsBound` re-derives `negotiation_hash` exactly as BNB's reference SDK does (canonical JSON of task, terms, price, currency, expiry, chain binding). Stored quotes are dropped unless it matches. The trial says plainly whether the signature covers the price. It is checked against live agents #2554 and #2555 and in `tests/negotiation-binding.test.mts`.
- Registration recovery is per draft, with "Start over instead". The profile editor uses one service index for read, check and write, and changes only the category tag.
- Smaller fixes:
  - category labels in Studio;
  - fee-cover wording;
  - prices above the 5 $U cap explained;
  - the courier path not held to the agent's price;
  - hand delivery retries only the index confirmation once on chain;
  - the funnel names its escrow network;
  - the job page discards stale polls and its deadlines tick;
  - the e-mail job picker is stable;
  - passkey-published agents are told Studio cannot edit them yet.

Also added afterwards:
- per-agent share images (`opengraph-image`);
- Discover pagination (`?pages=`);
- the restored `/pool-check` calculator, with the agent's price as an input instead of a hard-coded 0.1;
- a base `grid-cols-1` on every responsive grid, after a phone overflow;
- the light "not measured" tone raised to AA. Every text token now meets AA on every ground in both themes.

## Library modules with no UI caller

Kept on purpose because they are backend data features, but nothing in the
new UI imports them:
- `lib/leaderboard.ts` (rankings)
- `lib/hero/pipeline.ts` (old landing funnel)
- `lib/experiments/agent-advantage.ts`
- `lib/search/filters.ts`
- `lib/diagnostic/lifecycle.ts` (static explainer)
- `lib/altana/caps.ts` (legacy sessions)

Delete them or give them a page; do not let them drift.

## Not verified, or not done

- **No on-chain hire, settlement, review, delivery or registration was
  executed** in this session. Those paths call the unchanged `useHire`,
  `useJobActions`, `registerIdentityFromWallet`, `updateIdentityFromWallet` and
  delivery APIs, but they still need a funded test wallet run before release.
- Wallet libraries (wagmi, viem, the Altana passkey SDK) are no longer in the
  root layout. They wrap only `(app)` and `(flow)`, and the public header's
  account control is a lazily loaded island with its own provider. First-load
  JavaScript (gzipped, production build) is now about 205 KB on `/`,
  `/discover` and agent pages, down from about 464 KB. The workspace still
  loads about 484 KB, because it acts on a wallet. Set and Earn progress
  moved from the public campaign page to the workspace.
- On-chain money paths are covered by a manual plan:
  [`TEST-PLAN.md`](TEST-PLAN.md).
- Discover's intent reading is keyword-based (`lib/brief/interpret`), and
  the page says so. `/api/ask` and `lib/recommend/engine` remain unused.
- Builder Studio does not host agents. It says so, and links to BNB Agent
  Studio for deployment.
- Passkey wallets cannot sign builder-ownership or review messages, so those
  need a browser wallet. The Altana SDK signs only through a session key with an
  approved checker contract (`signOrder`), and Pokter keeps sessions disabled, so
  this is not fixable in the UI. The UI says so.
- `npm run sweep` fails under tsx with the Altana SDK's CJS export issue
  (upstream #88). The `/api/sweep` route works.
