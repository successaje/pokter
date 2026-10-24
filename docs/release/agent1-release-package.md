# Release package: core buying and earning journeys (Agent 1)

Prepared 24 October 2026. Nothing here is merged, deployed or configured in
production. Statuses below are kept distinct: **implemented** (code exists),
**tested** (automated tests pass), **checked locally** (exercised against a
local server or read-only against production), **verified live** (a real
journey completed in production). Nothing in this package is verified live.

## The PRs, and the order to merge them

| Order | PR | Depends on | What | Status |
| --- | --- | --- | --- | --- |
| 1 | #298 | none | Shared interfaces with ProofRun (types and design note) | implemented, type-checked |
| 2 | #299 | #298 | MCP accuracy, provider token and transfer fixes, deliverable gate, quote criteria hook, MCP deploy smoke | implemented, tested, checked locally; smoke step passes against production |
| 3 | #300 | none | Service mode from signed terms; proposal delivery days reach the job deadline | implemented, tested, checked locally with a live testnet quote |
| 4 | #301 | none | `/connect` onboarding; builder checklist | implemented, tested, checked in the browser |
| 5 | #303 | none (off by default) | x402 pay-per-call in U | implemented, tested, checked locally with the flag on; not verified live |

#300, #301 and #303 do not depend on each other, and any order works. #299
and #303 make the same one-line change to `package.json` (route tests), which
merges cleanly. Agent 2's ProofRun PRs come after #298; integrating the
ProofRun panel into the hire review step and the result into `check_delivery`
follows once its branch is on main.

## Manual steps that need your wallet

None can be done for you. Each turns a "checked locally" into "verified live".

1. **Buyer MCP funding (testnet).** In Claude Code with Pokter connected,
   run `prepare_hire` for agent 97/2618 with `max_budget: 1`,
   `escrow_chain_id: 97` and your own `owner_address`. Open the approval link
   and fund it with test $U. Send the job id. See
   `docs/release/mcp-walkthrough.md`.
2. **Provider journey (testnet).** One agent you own and a second wallet as
   poster: sign in, mint a token, post a request, prepare and sign a proposal,
   award, fund, stage and submit the deliverable, release, read earnings.
   Steps in `docs/release/mcp-walkthrough.md`.
3. **A hire from a proposal.** Fund an awarded proposal with a delivery time
   over 1 day, and confirm the job's deadline is that many days plus the
   review window.
4. **x402 (mainnet, real funds, only if you choose to turn it on).** Set
   `NEXT_PUBLIC_X402_ENABLED=true`, rebuild, and make one 0.1 U call to Brain
   on BNB (56/302257) from a browser wallet. See `docs/release/x402.md`.

## Release plan

1. Merge in the order above, one at a time, letting each deploy finish. The
   deploy workflow's checks run on every release, now including the MCP step.
2. After #299: confirm `/api/mcp/provider` answers 401 without a token, and
   that a delivered job's deliverable URL still opens (for example job
   56/57070, delivered by Brinkwatch).
3. After #300: open any hire to "Review the terms" and confirm the Service,
   You receive and If the delivery is wrong rows.
4. After #301: open `/connect` and run the server check.
5. #303 changes nothing visible until the flag is set; do not set it without
   step 4 of the manual steps.

## Rollback

Each PR is a single merge commit; revert it with `git revert -m 1 <merge>`
and redeploy. Specific notes:

- **#299 deliverable gate:** if a delivered job's deliverable stops loading,
  revert #299. Stored deliverables are untouched by it; it only changes when
  they are served.
- **#299 provider transfer release:** it deletes a former owner's unsubmitted
  staged draft only after the registry confirms they no longer own the
  agent. Reverting stops further releases; released drafts are not restored,
  and they could never have been delivered anyway.
- **#303:** unset `NEXT_PUBLIC_X402_ENABLED` and rebuild to turn it off
  without reverting. Receipts stay in `x402.db`.
- No PR migrates existing data. `x402.db` is new and empty until used.

## Remaining risks

- The public MCP route is not exercised by a route test (it loads the
  ESM-only SDK). Its changes were checked by a live local journey instead.
- Claude Code is the only client Pokter has run either journey with; the
  others are labelled untested.
- x402 depends on sellers settling their own payments. If a seller takes a
  payment and returns nothing, the buyer sees "unknown" and a receipt, and
  only the seller can refund.
- Drafts in the create flow still live in one browser.
