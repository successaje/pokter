# Marketplace readiness programme

This is the implementation checklist for the strongest product improvements
identified during the October 2026 review of the other BNB Chain Set and Earn
marketplaces. It is intentionally ordered by user and protocol risk rather than
visual novelty.

Status legend: `[ ]` planned, `[~]` in progress, `[x]` shipped and verified.

## P0 — make agents usable and accountable

- [~] Deployable builder path
  - [x] Route builders from an idea, existing runtime, existing identity or AI assistant.
  - [x] Generate a distinct, model-neutral implementation prompt.
  - [x] Test A2A and MCP endpoints before registration.
  - [x] Run an explicitly advertised private preview without wallet authority.
  - [ ] Offer a maintained starter repository or one-click deployment target.
  - [ ] Return from deployment with the endpoint prefilled.
- [~] Per-agent readiness ladder
  - [x] Separate registration, profile, endpoint, liveness, price and measurement.
  - [x] Show the first blocking condition and its exact next action.
  - [ ] Add independently verified campaign hires, actions and active days.
  - [ ] Add a public campaign-qualification export for reviewers.
- [~] Complete job execution timeline
  - [x] Present commissioned, funded, delivered, buyer-review and settled states.
  - [x] Attach retained transaction evidence to its corresponding state.
  - [x] Distinguish onchain facts, receipts and pending observations.
  - [x] Give expiry and contested work explicit non-success terminal states.
  - [ ] Add independently observed seller-contact and execution-start events.
  - [ ] Add the reclaim transaction when the commerce SDK exposes it.
- [~] Marketplace defaults to usable agents
  - [x] Default to hireable, recently responsive agents with current signed prices.
  - [x] Add a recent-response visibility control.
  - [~] Add Most evidence, Response and Price sorting.
  - [ ] Add Completed jobs sorting once marketplace-wide economic history is joined.
  - [ ] Preserve an explicit path to the full ERC-8004 registry.
- [~] Permission centre
  - [x] Plain-language authority and prohibited-actions summary for commissions.
  - [x] Show the exact payment token and approved escrow contract.
  - [x] Show the exact job budget and delivery expiry.
  - [ ] Simulation where supported.
  - [~] One-action revocation and remaining-allowance visibility.
  - [ ] Add protocol and asset allowlists before delegated execution is re-enabled.

## P1 — make decisions faster

- [ ] Explain marketplace ranking with a visible “Why this order?” disclosure.
- [ ] Publish a first-party ranking-neutrality policy.
- [ ] Simplify agent pages around outcome, evidence, price, authority and risk.
- [ ] Move raw probes, registry JSON and methodology detail behind disclosure.
- [ ] Add a compact “What the chain says” evidence stream with source links.
- [ ] Make ongoing jobs reachable from Account, Activity, wallet menu and mobile navigation.
- [ ] Add a global status cue for work awaiting the user.
- [ ] Add builder analytics: impressions, profile views, hire starts, completions and failures.
- [ ] Add public endpoint and agent-card conformance testing.

## P2 — extend the marketplace

- [ ] Read-only wallet-aware discovery with an explanation for every recommendation.
- [ ] Search agents, jobs, receipts and builder identities from one command surface.
- [ ] Category-specific evidence instead of one universal performance number.
- [ ] Machine access for discovery and hiring through a documented API or MCP surface.
- [ ] Skills and independent evaluator directories after the core hiring flow is stable.
- [ ] Reviewer/demo mode that presents only verifiable production data.

## Product constraints

- Never invent APR, TVL, win rate, volume or success metrics.
- Never treat registration, an HTTP 200 or a token approval as completed work.
- Show unavailable evidence as absent, not as a zero score.
- Keep mainnet identity and testnet commerce visibly distinct until migration.
- Do not give Pokter-operated agents preferential ranking.
- Do not introduce branded protocol vocabulary when plain language is clearer.
- Do not imply that Pokter campaign progress is BNB Chain qualification; BNB Chain
  remains the final verifier.
