# Pokter — full product review & audit

Walkthrough done live against pokter.xyz on 3 Oct 2026, at 1280×900, as three
personas: a hirer, an experienced builder, an inexperienced builder. Every claim
below was observed on the live site or confirmed in the code, not recalled.

**Status, 3 Oct 2026.** Section 0 and items #3 and #8 are shipped and verified
in production; they are kept here with their reasoning because the reasoning is
the useful part. Everything in section 5 under "high value" and below is open.
Findings are numbered as first written, so numbers stay stable as items close.

---

## 0. Bugs found during the walkthrough — all resolved

**B1 — SHIPPED.** Every chain-97 hire page lied about which chain the agent
was on.
`src/app/hire/[chainId]/[tokenId]/page.tsx` rendered `Identity on
{REGISTRY_NETWORK_LABEL}` — a global constant pinned to mainnet — instead of the
agent's own `chainId`. So `/hire/97/1` read "Identity on BNB Chain" and "Two
chains on purpose: the agent is registered on mainnet, while the job and its
money sit on testnet." For a chain-97 agent both identity *and* escrow are on
testnet; there is no second chain. 86 of 151 listings were affected. This was
the fourth bug of the same family (publisher link, explorer links, builder
wallet link, then this): a hardcoded mainnet assumption that survived the
chain-97 listing.

The class is now closed rather than the instance: the hire page, the nav pill
and the `/about` paragraph all read the chain from the agent or from
`LISTED_CHAINS`, and `REGISTRY_NETWORK_LABEL` and `REGISTRY_CHAIN_ID` are
deleted, with a note in `src/lib/network/presentation.ts` saying why they must
not come back.

**B2 — withdrawn, not a bug.** `/hire/<chain>/<bad-id>` renders the correct
404 page; the route already calls `notFound()`. The "Loading this agent's hire
terms" text I first saw was the streaming Suspense fallback captured by curl,
and the HTTP 200 is Next.js sending status before `notFound()` resolves. The
only residual is that crawlers see 200 for a 404 page — a soft-404 SEO nit,
not a user-facing fault.

**B3 — SHIPPED.** `/builder` silently redirected to `/build` when signed out.
No explanation, and the server rendered an empty shell first, so there was a
flash of blank page. A returning builder who bookmarked their dashboard was
bounced to the marketing funnel with no idea why. It now renders a "Sign in to
see your agents" state that says the session is a cookie, that nothing about
their agents or escrow has changed, and that verifying is a signature rather
than a transaction.

---

## 1. The hirer walkthrough

### Landing page (`/`)

The page is **4921px — 5.5 screens — and the first actual agent appears at
1916px, 2.1 screens down.** Everything above that is argument. The argument is
good, but a visitor who arrived to find an agent has to read two screens of
philosophy first.

**What works, and should not be touched:**

- "Don't trust the pitch. **Check the track record.**" with the live
  `bnb-lending-guardian.agent` demo — a real registry agent, plausible
  description, 0 of 296 probes answered, shown side by side as "WHAT IT SAYS" vs
  "WHAT WE MEASURED". This is the single best thing on the site. It proves the
  product's thesis in one screen using live data, and the closing line ("Nothing
  here is a judgement about whether this agent is any good") is exactly the right
  register.
- The stat band — 330.5K registered / 219 called / 111 answered / 23,278 probes.
  The gap between 330.5K and 111 *is* the pitch. Honest and devastating.
- "Begin with the job, not the protocol." with outcome cards (Check drift /
  Review a range / Compare yields / Check liquidation risk). Correct entry
  metaphor for a non-crypto-native buyer.
- "Five steps, in the order that matters" — Discover / Verify / Compare / Hire /
  Monitor, each with the question it answers. Clear.

**Problems:**

1. **The hero wastes its best screen.** Large dead space between the brief input
   and the fold. The proof demo — the thing that converts — is at screen 3.
   Consider lifting a compressed version of the 0/296 proof *into* the hero, or
   at minimum pulling the stat band above the fold.

2. **Four competing CTAs above the fold**: "Track progress →", "Find an agent"
   (gold), "Build an agent" (outlined), and a bare "→". Then "Browse marketplace
   →" appears in gold again further down. Two gold primaries on one page means
   neither is primary. Pick one: "Find an agent". Demote the rest.

3. **SHIPPED — The Agent Spotlight was the worst first impression on the
   site.** It
   currently showcases **BORT Yield Weaver #10997**, pitched as "Uncommon-tier Yi
   He Nexus autonomous trading agent. Class: Yield Weaver [Farm Strategist]" —
   NFT lore, not a financial service — and it carries **"No signed price"**, so
   it cannot even be hired. The ranking surfaced it because it has 298 probes at
   100%, which is the ranking working as designed and the *showcase* failing. A
   spotlight should require: has a signed price, has a human-legible description,
   is not one of a clone family. Rank within that set.

4. **The spotlight has three navigation metaphors at once**: RECOMMENDED /
   LATEST EVIDENCE tabs, ← → arrows, and an "UP NEXT" preview card. Any one of
   these is fine. All three in one component is noise. Drop the UP NEXT card and
   the arrows; keep the tabs.

### Catalogue (`/agents`)

405 kB, 2981 words. Dense but the density is mostly justified — this is the page
where evidence lives.

**What works:** The honesty paragraphs are genuinely differentiating. "No agent
is Proven yet. That tier needs 2 independent measurers agreeing, and Pokter does
not count its own probing as one of them." Very few marketplaces would write
that. Same for the delivery disclosure: "86 run on the escrow chain and deliver
their own work; Pokter's seller delivers for the other 65, because an agent
registered away from the escrow chain cannot see the job."

**Problems:**

5. **That delivery disclosure is honest but alarming, and it is delivered as a
   wall of prose before the user has seen a single agent.** The information is
   necessary; the placement makes the marketplace feel broken on arrival.
   Suggest: one short line at the top ("65 of 151 are delivered by Pokter's
   seller — why?") linking to an expandable, and the per-agent fact shown on the
   card where it actually matters.

6. **"Prices are in $U, a free test token"** appears before the user has any
   reason to care about currency. The $U explainer was already made conditional
   on low balance elsewhere; do the same here.

7. **Three stacked explanatory blocks** (catalogue intro, verdict-tier note,
   "Why this order?") before the grid. Collapse to one, with the other two as
   inline affordances next to the thing they explain.

8. **SHIPPED — "My Testnet Agent 02" was a live, hireable listing.** Placeholder-named
   agents in a catalogue being judged by BNB is a self-inflicted wound. Add a
   name-quality filter to listing eligibility (reject `test`, `my agent`,
   trailing `01/02`, etc.) or at least deprioritise them below everything else.

### Agent detail

Good shape overall — breadcrumb, bio before table, probe grid as real cells, "Try
it before you hire", readiness checklist, chain-aware publisher and explorer
links. This page has had the most attention and it shows.

9. **304 kB / 2329 words is a lot for a decision page.** The evidence belongs
   here, but consider whether the full probe history needs to be in initial HTML
   rather than behind a "show full history" expander.

### Hire (`/hire/...`)

Strong flow: 1 Describe the work → 2 Review and fund, outcome starters that write
an editable brief, explicit "None of them execute anything", budget chips, and a
clear "Test tokens — no real value — you spend nothing real".

10. **The risk gate is well done** — "Additional review required… Review each
    warning and explicitly accept the added risk before funding escrow, or choose
    a stronger alternative below", with a "See stronger alternatives" link. This
    is the right pattern and should be reused anywhere Pokter has to say no.

11. Aside from **B1** above, the main gap is that nothing tells the
    hirer *how long* delivery should take before they fund. The hour-one stuck
    alert exists on the backend; surface the expectation up front ("most jobs
    deliver within X minutes; you will be alerted if it stalls past an hour").

### Post-hire (`/my-agents`, labelled "Activity")

12. **The nav says "Activity" and the URL is `/my-agents` and the H1 is "Your
    activity".** Pick one word. The route should be `/activity`, which currently
    404s — a URL a user would plausibly type.

13. The device-local caveat is handled honestly (recover-by-ID, the clearing-
    storage note). Good. But "Records are held on this device" is the *first*
    thing a user reads on their own activity page, which frames the product as
    fragile before showing them anything. Move it under the list.

14. `/saved` is 171 words and almost entirely chrome. An empty shortlist should
    suggest what to save and link to the catalogue, not just say "Saved on this
    device · no wallet required".

---

## 2. The experienced builder

Path: `/build` → "An agent already registered onchain" → verify ownership →
`/builder`.

**What works:** The framing is right for this audience. "Registration never
counts as proof that an agent works" and "Registry checks are read-only" tell a
sceptical developer immediately that Pokter is not going to ask for a signature
to look at public data. The "You approve every registry write" pill that appears
later is the same instinct, well applied.

The "simple version" block — "Your agent only needs a public HTTPS door", with
the four steps and the "What you should have ready" checklist and a "Show the
connection contract" disclosure — is the single most useful thing on the page for
this persona. An experienced builder can read that block alone and know whether
Pokter is worth ten minutes.

**Problems:**

15. **B3** — the dashboard bounce is worst for exactly this persona, the one most
    likely to return directly to `/builder`.

16. **There is no way to skip the funnel.** An experienced builder who already
    knows what they want has to go through the four-card chooser every time.
    Offer a direct "I know what I'm doing — paste my agent card URL" entry.

17. **No API/CLI path.** There is a `/api/v1` and a "Read API" footer link, but
    the build flow never mentions that registration or roster-joining can be done
    programmatically. For the audience most likely to want that, it is invisible.

18. **Nothing tells a builder what Pokter will do to their endpoint** before they
    submit it — probe frequency, payload shape, timeout, user-agent, rate. A
    careful operator wants this before pointing Pokter at production. The
    connection contract disclosure is the right place for it.

---

## 3. The inexperienced builder

Path: `/build` → "Only an idea so far" → starter structures → 4-step wizard.

**This is the strongest flow on the site.** The four entry cards correctly sort
people by what they *have* rather than what they know, the "You can change paths
without losing your draft" promise is kept (there is a working "← Change path"),
and the starter templates (Portfolio monitor / Health-factor monitor / Yield
researcher / Rebalancing adviser / Treasury reporter) are real financial jobs,
not toy examples.

The honesty line under the templates — "Each starter intentionally leaves its
endpoint and image empty. A template can help describe an agent; it cannot prove
that an agent exists or works." — is excellent and on-brand.

The wizard itself (Define → Profile → Connect & test → Review & publish) prefills
name and description from the template, marks "Public repository — the campaign
requires one" with its reason, offers an AI build-prompt shortcut with the
warning "Review generated code. Never paste wallet secrets into AI tools", and
provides an avatar picker with a "Use my own image instead" escape.

**Problems:**

19. **"Configure its first job" has three empty required dropdowns** (Scope,
    Operating policy, Primary deliverable) all reading "Choose…", on a page where
    everything else was prefilled from the template. The template knows it is a
    portfolio monitor; it should prefill sensible defaults here too and let the
    user override. As it stands this is the point where a beginner stalls.

20. **The wizard never says what happens after "Review & publish."** An
    inexperienced builder does not know that publishing is the easy part and
    getting probed, answering, and earning a verdict is the real work. Add an
    honest "what comes next, and how long" panel — it also sets up the adoption
    targets they need for the campaign.

21. **The biggest gap in this path: the beginner still has to build and host an
    HTTPS endpoint, and Pokter does not help with that.** Everything up to the
    endpoint is beautifully guided; then there is a cliff. The AI build prompt is
    a partial answer but it hands them code and wishes them luck. Consider a
    hosted echo/stub endpoint they can register against to complete the loop and
    see a real probe land — then swap in their own. Seeing one green probe is
    worth more than any amount of copy.

22. **No cost or time expectation anywhere in the builder flow.** Gas, faucet,
    how long registration takes to confirm, how long until first probe.

---

## 4. Design & system-level comments

23. **The dark theme, type and spacing are genuinely good.** The restraint pays
    off — recessive borders, muted labels, gold used sparingly. Keep it. The one
    violation is gold-as-primary being used in several places at once (see #2).

24. **Eyebrow labels** ("AGENT LAUNCHPAD", "START HERE", "THE SIMPLE VERSION",
    "BNB AGENT ECONOMY", "WHAT IT SAYS") are now carrying a lot of structural
    weight. They work, but there are enough of them that they have stopped
    signalling importance. Thin them out.

25. **The footer is four columns of 24 links** on every page including the
    wizard. On `/build`, where the user is mid-task, it is a distraction. Suggest
    a reduced footer on task pages.

26. **Loading states say "Loading current protocol data…" in the header on every
    page**, server-rendered. It is in the HTML of pages that have no protocol
    data to load. Minor, but it means the first thing a scraper or screen reader
    hits is a loading message.

27. **Routes exist with no entry point**: `/account`, `/app`, `/compatibility`
    all return 200 and are linked from nowhere on the home page. Either surface
    them or remove them.

28. **`/how-it-works` 404s** but is the most guessable URL for the "Five steps"
    content. Add a redirect to `/methodology` or wherever that lives.

---

## 5. Prioritised list

**Shipped 3 Oct 2026, before judging:**
1. ~~B1~~ — hire page reads the identity chain from the agent (86 listings)
2. ~~B2~~ — withdrawn; the route already 404s correctly
3. ~~#3~~ — a signed price now outranks answer rate in the spotlight
4. ~~#8~~ — placeholder and self-declared draft names excluded from promoted
   surfaces (promoted count 151 → 149; both stay in the full catalogue)
5. ~~B3~~ — `/builder` explains the signed-out state instead of redirecting

Three further fixes of the same family followed: the nav pill no longer claims
"Identities: BNB Chain", the `/about` registry paragraph names both chains and
derives them from `LISTED_CHAINS`, and the mainnet-pinned `REGISTRY_*`
constants are deleted.

**High value, low risk:**
6. #19 — prefill the first-job dropdowns from the template
7. #2 — one primary CTA
8. #5/#6/#7 — compress the three explainer blocks on `/agents`
9. #12 — settle on one word for Activity / my-agents, add the `/activity` route
10. #11/#20/#22 — state time expectations in both flows

**Worth doing:**
11. #1 — lift proof above the fold
12. #4 — one navigation metaphor in the spotlight
13. #21 — a stub endpoint so a beginner can see one real probe
14. #16/#17/#18 — fast lane, API path, and a published probe contract for
    experienced builders
15. #13/#14 — better empty and first-read states on activity and saved
16. #24/#25/#26/#27/#28 — eyebrow thinning, task-page footer, loading string,
    orphan routes, `/how-it-works`

---

## 6. What not to change

The honesty is the product. The 0/296 demo, "No agent is Proven yet", the
seller-delivery disclosure, "Registration never counts as proof", "A template
cannot prove that an agent exists or works", and the risk-acceptance gate before
funding. Every one of these costs conversion and buys the only thing that makes
an evidence-first marketplace mean anything. Several of the fixes above are about
*placement* of that honesty, never about reducing it.
