# Pokter launch and mainnet roadmap

This is the working release checklist for Pokter's agent launchpad and eventual
mainnet escrow release. Update it in the same commit that changes a listed
capability. A checked item means the implementation exists and has passed its
documented verification; it does not mean that an adjacent protocol guarantee
can be inferred.

Legend: `[x]` complete, `[~]` implemented but still needs the named follow-up,
`[ ]` not complete, `[!]` release blocker.

## Campaign activation (1 October–5 November 2026)

- [x] Link the official registration before users begin qualifying actions.
- [x] Publish the exact hire/build qualification checklist in-product.
- [x] State that BNB Testnet hires count and token approval alone does not.
- [x] Warn that only agents listed after the official announcement qualify.
- [ ] Show each connected wallet's three-agent/two-marketplace hire progress.
- [ ] Show qualifying-agent completed hires by distinct independent wallets.
- [ ] Show five category-consistent onchain actions across three separate days.
- [ ] Add a campaign evidence export for participant verification.

## A. Security maintenance

- [x] Upgrade Next.js beyond the affected `next/og` release.
- [x] Resolve the transitive Hono advisory.
- [x] Resolve the development `brace-expansion` advisories.
- [x] Pass lint, type-check, tests, protocol checks, rate-limit checks and a
  production build after the upgrades.

## B. Launch onboarding

- [x] Existing ERC-8004 agent path.
- [x] Prepare-an-agent path.
- [x] Starter-kit path.
- [x] A2A and MCP selection.
- [x] Outcome-led name, description and category.
- [x] Public endpoint and image fields.
- [x] Browser-local draft persistence.
- [x] Readiness checklist and exact registration preview.
- [x] Wallet-owned ERC-8004 registration on BNB Chain or BNB Testnet.
- [x] Post-transaction owner and registration-file verification.
- [~] Resume a draft in the same browser; account-backed cross-device drafts
  remain open.
- [ ] List and manage multiple drafts from the builder account.
- [x] Show explicit Draft, Registered, Measured, Listed and Hireable states,
  derived from registry, probe-history, catalog and live quote facts.

## C. Guided preparation

- [~] Structured agent brief is live; a conversational, one-question-at-a-time
  mode remains open.
- [ ] Ask one necessary follow-up question at a time.
- [~] Generate editable name and description containing the declared outcome,
  evidence and limitations; separate runtime instructions remain open.
- [ ] Generate input, output and capability schemas.
- [x] Recommend A2A or MCP from the builder's selected interaction model with a
  plain-language explanation.
- [ ] Generate a versioned ERC-8004 registration draft.
- [ ] Identify and refuse unsupported performance claims.
- [x] Keep generated material private until the builder publishes it.
- [x] Never allow generated copy to substitute for a working endpoint.

## D. Starter kits

- [x] Portfolio Monitor profile starter.
- [x] Health-Factor Monitor profile starter.
- [x] Yield Researcher profile starter.
- [x] Rebalancing Adviser profile starter.
- [x] Treasury Reporter profile starter.
- [ ] Reference runtime for every starter.
- [ ] System prompt and input/output schema for every starter.
- [ ] A2A or MCP manifest for every starter.
- [ ] Deployment, environment and security guide for every starter.
- [ ] Test fixtures and known limitations for every starter.
- [ ] Download or fork a complete starter project.
- [ ] Return-to-Pokter verification link after deployment.

## E. Compatibility laboratory

- [x] HTTPS-only endpoint requirement.
- [x] Safe A2A or MCP handshake.
- [x] Capability and quote-capability summary.
- [x] Builder-visible DNS, redirect and SSRF safety report.
- [ ] Protocol-version and schema validation.
- [ ] Timeout, malformed-request and empty-response tests.
- [~] Private sample-task execution is available for endpoints that advertise a
  dedicated preview, simulate or dry-run capability; fixture coverage remains
  open.
- [ ] Quote negotiation and payee/identity consistency test.
- [ ] ERC-8183 and delivery-manifest compatibility test.
- [ ] Downloadable, versioned compatibility report.

## F. Private trial and preview

- [x] Exact registration JSON preview.
- [x] Marketplace card and public profile opening preview.
- [x] Mobile and desktop preview.
- [ ] Private sample-request console.
- [x] Raw and interpreted response views.
- [x] Latency, protocol and failure details.
- [ ] Trial history.
- [ ] Successful-trial gate before Pokter recommends publication.

## G. Publishing and admission

- [x] Builder signs and owns the identity.
- [x] Receipt, owner and registration file are re-read from chain.
- [x] Mainnet registration requires explicit acknowledgement.
- [ ] Refuse a mainnet token URI that is not on the production domain.
- [ ] Display live gas estimate and registration-wallet balance.
- [ ] Add wallet-response timeout and recovery guidance.
- [ ] Private, unlisted and public visibility choices.
- [ ] Verify payout wallet and pricing disclosure.
- [ ] Admit new agents as Pending measurement.
- [ ] Require a successful independent probe before listing.
- [ ] Require a quote and compatible delivery path before hireability.

## H. Builder operations

- [x] Ownership verification and authenticated builder session.
- [x] Published-agent profile management.
- [x] Builder fleet dashboard.
- [ ] Endpoint-health timeline and current failure reason.
- [ ] Jobs, delivery, completion, dispute and earnings metrics.
- [ ] Builder notification preferences.
- [ ] Pause, unlist and retire controls with an audit trail.
- [ ] Troubleshooting actions for failed measurements.

## I. Mainnet escrow readiness

- [!] Replace the hardcoded testnet `ESCROW_CHAIN` with the shared network
  source of truth.
- [ ] Enforce server/browser/network agreement in tests and CI.
- [ ] Add a mainnet-mode CI build.
- [!] Implement and verify expired-escrow reclaim for EOA wallets.
- [!] Implement and verify expired-escrow reclaim for passkey wallets.
- [ ] Complete valid delivery, settlement, invalid delivery and dispute tests.
- [ ] Prove a disputed provider cannot receive payment.
- [ ] Reconstruct buyer jobs automatically from chain events.
- [ ] Prove recovery after browser storage is cleared.
- [ ] Remove remaining hardcoded testnet language.
- [ ] Review and document proxy, owner, administrator and pause controls.
- [ ] Add database backups and perform a restoration rehearsal.
- [ ] Add application, RPC and transaction-failure monitoring.
- [ ] Publish incident-response, rollback and release procedures.
- [ ] Execute and review a capped low-value mainnet canary.
- [ ] Record explicit final mainnet approval.

## J. Later expansion

- [ ] Pokter-hosted starter runtimes.
- [ ] Scheduled execution and external memory.
- [ ] Tool composition and a visual workflow canvas.
- [ ] Versioned agent releases and runtime observability.
- [ ] Argument-aware delegated execution with adversarial tests and a dedicated
  protocol audit.
