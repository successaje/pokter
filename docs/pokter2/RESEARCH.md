# Pokter 2 — research and product direction

Internal report, 10 October 2026. It records what the rebuild was based on, so
later decisions can be checked against the evidence rather than against
taste.

## 1. Where BNB Chain is going

- **BNB Agent Studio** (live on BSC mainnet since 1 July 2026) is an
  IDE-first creation and deployment tool: `@bnbagent/studio-cli`, skills
  installed into Cursor or Claude Code, one-command deploy to AWS Bedrock
  AgentCore (Azure Foundry also listed). Deploy registers the ERC-8004
  identity and the ERC-8183 task interface. Agents pay for their own model
  calls through x402. There is **no public deep link** for "list this agent
  on a marketplace", so marketplaces have to re-collect what Studio already
  knows.
- Studio agents served from AgentCore often need an OAuth2 client-credentials
  token. **A marketplace cannot call them anonymously**, so many Studio
  agents are listed and still cannot be hired.
- **"Build the Era"** picks the officially adopted community marketplace for
  Agent Studio. Winners are announced on 5 November 2026. Pokter must not
  claim the title before then.
- **"Set and Earn"** (1 Oct – 5 Nov 2026): a hire counts when its hire event
  is emitted on chain, and approval alone does not count. A buyer needs 3
  hires of different agents across at least 2 marketplaces. A builder needs
  one ERC-8004 agent hired by 3 distinct external wallets, with at least 5
  category-consistent on-chain actions over at least 3 days. Testnet counts.

## 2. Standards, as deployed

| Standard | State | What Pokter does with it |
| --- | --- | --- |
| ERC-8004 identity + reputation | Draft EIP, deployed on 56 and 97 | Lists agents, verifies owners, registers new identities |
| ERC-8004 validation registry | Not deployed on BSC | Nothing. Shown as unavailable |
| ERC-8183 (BNB "APEX": router + optimistic policy) | Draft EIP, deployed on 56 and 97 | Hire, fund, submit, settle, dispute, reclaim on 97 |
| x402 / B402 | B402 is live on BSC mainnet | Not integrated. Shown as **planned**, never as supported |
| A2A agent cards | Widely served | Probing, quotes (`negotiate`), delivery (`notify_funded`) |
| MCP | Widely served | Endpoint preflight for builders |

## 3. The competitive field (the eight shortlisted marketplaces)

What each one does that is worth learning from, stated as the problem it
solves:

- **Marque / Mandate**: free signed quote before any wallet opens, and "Try
  free" before paying. This removes the fear of paying for an unknown result.
- **Dolphin**: per-agent input forms, provenance on every field, and copy in
  plain language. This removes the protocol vocabulary from the buyer's path.
- **Agent Souk**: probes every endpoint and lets you hide unresponsive
  agents, plus a cart for several hires at once. This cuts registry noise.
- **HelloFugu**: a "what this agent does not do yet" disclosure and a
  permissions panel. This is candour as a trust signal.
- **KATTEGAT**: "no evidence" is never shown as zero. It refuses to invent
  performance.
- **TermiX**: package tiers, a request-for-quote path, and a visible
  protection timeline. It treats the purchase as a service.

Weaknesses they share, and where Pokter should differentiate:

1. **Demand is mostly the team's own wallets.** Real buyer reviews are close
   to zero everywhere. Pokter's reviews are signed by the wallet that funded
   a completed job, and it should say how many exist, including zero.
2. **Onboarding friction.** Everyone else needs a browser wallet and gas.
   Pokter has passkey wallets with sponsored gas, so a hire is one
   confirmation, and nobody else offers that.
3. **The dispute window is unexplained.** Under the optimistic policy,
   silence settles in the agent's favour, and no site explains or reminds the
   buyer. Pokter's job page must make the review deadline the most
   prominent thing on the page.
4. **Studio agents cannot be hired, and nobody tells the builder why.**
   Builder Studio's import path should diagnose that ("your endpoint needs
   an anonymous A2A card") rather than fail silently.
5. **No receipts that follow the buyer.** The workspace keeps every hire,
   recovers jobs from chain, and shows campaign progress.

## 4. Pokter's real differentiators (verified in code)

- An evidence model that never fills gaps: six verdicts
  (`proven`, `reliable`, `intermittent`, `observed`, `failing`,
  `not measured`). Pokter never counts itself as independent, and
  performance and risk are never scored.
- Scheduled probes since August: a track record per agent over 24 hours, 7
  days and 30 days.
- Prices exist only as **agent-signed quotes**, with the signature recovered
  to the registered ERC-8004 wallet.
- One escrowed job, **no standing wallet authority**. Delegated sessions are
  disabled in code until arguments inside calldata can be constrained.
- Passkey wallets, sponsored gas, and a PancakeSwap top-up for $U.
- A testnet delivery courier, so a hire returns the agent's actual answer
  or nothing, followed by a refund.
- Receipts are verified against the on-chain hash before payment can be
  released.

## 5. UX failures in the previous frontends (why this is a rebuild)

- Too many entry points to the same catalogue (`/agents`, `/discover`,
  `/categories`, `/leaderboard`, `/census`, `/compare`) with overlapping
  jobs.
- The evidence vocabulary was shown before the task vocabulary: buyers met
  "attestations" before they met "what will I get".
- Hiring sat in a drawer over a very long dossier. On a phone, the
  irreversible step and the evidence competed for one screen.
- Workspace, account, saved and activity were four places for one person's
  state.
- Builder Studio was a single 1,800-line component that showed every field
  at once.

## 6. Positioning

**Find agents that actually work.** Discover, compare and hire AI agents on
BNB Chain, and see the evidence behind them before you pay.

Lead with the financial agents (the five categories Pokter classifies), and
keep the architecture category-agnostic.

## 7. Design directions considered

1. **Terminal / neon Web3.** Rejected. It signals speculation, tires the eye
   over long use, and looks like every competitor.
2. **Editorial serif publication** (the previous identity). Rejected. It is
   slow to scan, decorative in a working app, and the brief says not to
   anchor on it.
3. **Soft consumer app** (pastels, illustrations, everything rounded).
   Rejected. It is approachable but undercuts the rigour that is Pokter's
   whole argument.
4. **Instrument** (selected). Pokter is a measuring instrument for agents.
   Warm paper neutrals and graphite ink, hairline rules instead of boxes,
   and a single typeface family (Instrument Sans) with a monospace face for
   measurements. The yellow "proof tile" from the logo appears only where
   something has actually been checked. Evidence colours carry meaning and
   are never decorative. Each line of the hero animation is a real check
   with a real result.

**Why Instrument:** the product's job is to separate claims from observations.
A visual language built on calibration (scales, rules, readouts, specimen
labels) says that before any copy is read. It keeps the layout calm enough
for a workspace, and it is distinctive among the eight competitors.

## 8. Risks

- Live data depends on 8004scan. Every page has a designed "registry
  unreachable" state.
- Mainnet hiring is off for the campaign window, by decision. The UI says
  "test tokens" wherever money appears.
- The gas sponsor depends on the operator wallet's balance. Without it the
  flow falls back to the faucet path.
- Agents registered on mainnet often answer only `negotiate`. On testnet the
  courier warns before funding that nothing may be delivered.
