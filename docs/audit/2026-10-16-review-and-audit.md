# Review response and audit, 16 October 2026

Answers the "Pokter Updated Marketplace Review" (evidence snapshot 15 October
2026) and records a code audit run alongside it. Everything under **Done** is
on branch `fix/review-and-audit-2`. Everything under **Open** is either a
decision or spend that belongs to the team, or work too large for this branch.

## The review's recommendations

### 1. Make every payment explanation agree — done

One source of wording, `src/lib/erc8183/payment-terms.ts`, used by the hire
panel, homepage, how-it-works, the seller inbox and support. Then a full sweep
of every surface for the three claims the escrow does not support:

- **A buyer accepts or approves a delivery.** There is no such step. Removed from the
  hire flow, job timeline, settle messages, wallet errors, the /build card,
  the integration kit and the commission-authority list.
- **The agent is paid "when it delivers".** It is paid after delivery *and* a
  review window without a dispute. Fixed in the funded screen, the MCP tools'
  descriptions and results, the /mcp page, and how-it-works.
- **A dispute writes a rejection.** It starts a vote. Fixed on the risk page,
  and the job page no longer shows "doing nothing accepts" once a dispute is
  open.

Job states now say what they are, in the lists as well as on the job page:

| On chain | Before | Now |
| --- | --- | --- |
| SUBMITTED, disputed | "Delivered · review it", under Needs you | "Disputed · vote open", needs nothing from the buyer |
| SUBMITTED, disputed, past deadline | told to reclaim, given no button | "Not delivered · reclaim", with the button |
| REJECTED | "Disputed: the voters decide" | "Rejected · refund", with a reclaim fallback |
| EXPIRED | "the agent never delivered" | ended unpaid: no delivery, or a dispute that missed quorum |

The same corrections apply to emails, in-app notifications, builder alerts,
the seller inbox and the quest page. "Accepted" as the name for a completed
job is now "settled" on Proof, rankings, the evidence ladder and Studio.

### 2. Strengthen the checks before widening the claims — mostly done

**Health factor grader.**
- The false pass is closed: a no-debt answer marked liquidatable now fails.
- Also fail: wrong-account answers, malformed liquidation flags, and boundary
  and under-water positions (`tests/health-factor-judge.test.mts`).
- **Stale coincidental matches:** paid grading was asymmetric. A disagreement
  more than 15 minutes from the agent's own reading was excused, but an
  agreement that far apart still counted as a pass. Now neither counts outside
  the window. Results already recorded are not regraded.
- Every paid pass states its basis (a later reading, consistent with the
  position, not proof of the exact block). The methodology says so, and no
  longer claims Pokter "does not pay for checks".

**Misleading result found while checking.** Brinkwatch's page showed "Matched
Venus on 0 of 3 live positions" over two graded paid answers. There were two
causes:
- House agents answer a free call with a priced preview, and the check graded
  that preview as unreadable.
- The page showed the newest run, so a free call replaced the paid result.

Fixed: a priced preview records as paid-only, and a graded paid hire outranks
any free call.

**Category fixtures.** Before this branch, no house flagship could answer its
own category's fixture: each refused it at the brief check, before any work.
That made "run the suites" impossible as stated. Paying for them would have
bought refusals and published them as failures.

| Category | Fixture | Fits the house agent |
| --- | --- | --- |
| Grid | `grid-plan-2`: asset, budget, range, grid count | Gridloom: yes, and its plan passes at any live price |
| Yield | `yield-net-return-2`: amount, stablecoin, horizon, threshold | Cresthold: yes, and its actual answer passes; a changed asset fails |
| Rebalancing | `v3-range-1`: live PancakeSwap v3 positions in a sampled wallet, graded against Pokter's pool reading | Centreline: yes |
| Token safety | `token-safety-2`: four real addresses (no code → Avoid; two Binance-Peg stablecoins with an active minter → Caution; WBNB → Safe) | Touchstone: yes, once it stopped calling WBNB a Caution (fixed here) |

Each fixture now has a test asserting a service in its category can read it.
That test is what was missing when version 1 shipped.

**Still open: running the suites.** House agents sell their answers, so a
free call records *paid-only* (now shown honestly). Grading them needs
team-funded fixture jobs on mainnet. That is real money and the team's call.
The route refuses mainnet unless `ASSAY_PAID_ALLOW_MAINNET=1` is set on the
server.

| Agent | Suite | Jobs | Price each | About |
| --- | --- | --- | --- | --- |
| Gridloom `56:374114` | grid-trading | 3 | 0.08 $U | 0.24 $U |
| Cresthold `56:374112` | yield | 3 | 0.10 $U | 0.30 $U |
| Touchstone `56:374115` | token-safety | 4 | 0.05 $U | 0.20 $U |
| Centreline `56:374113` | rebalancing | one per sampled wallet | 0.10 $U | ~0.3 $U |

That totals roughly 1 $U plus gas. After this branch deploys, dry-run first
(nothing is funded without `"apply": true`):

```
curl -s -X POST https://pokter.xyz/api/assay/paid \
  -H "authorization: Bearer $SWEEP_SECRET" -H 'content-type: application/json' \
  -d '{"agent":"56:374114","category":"grid-trading","budgetU":0.08}'
```

The sweep grades deliveries as they arrive. A failed case stays visible.

### 3. Strict counts — done

- The homepage headline is "Paid jobs answered". It excludes lifecycle demos,
  self-hires and team test hires, and names each excluded group with its count.
- The Proof headline (`answeredDeliveries`) now subtracts settled self-hires
  such as job 1444.
- On the review's evidence, the strict figure is 7.

### 4. Turn diagnostics into operator and buyer activation — open

This needs outreach, not code. The integration kit, the hire-blocker display
and the outreach list from earlier work are the tools for it. The review's
"done when" is an operator fixing their quote signature from public
instructions alone. Pokter cannot produce that itself.

### 5. Prove one clean assistant journey — partly done

- The MCP descriptions now say a quote contacts the agent's own endpoint,
  needs an A2A endpoint, and is not idempotent.
- The recording itself (a fresh client: initialise → list → search → profile
  → hire link) still has to be made, after this deploys.

## Audit findings fixed on this branch

- **Secret names leaked.** The public `/api/wallet/sponsor-gas` route returned
  the escrow configuration error verbatim: secret names and the
  `fly secrets set` command. `/api/hire` and `/api/altana/session` did the
  same. The detail now goes to the log only.
- **Email injection.** `/api/notifications/event` is unauthenticated, and put a
  caller-supplied `agentName` into subscribers' email. The name now comes from
  Pokter's job record.
- **localhost links.** Emails, the seller card and deliverable links fell back
  to `http://localhost:4311` when `NEXT_PUBLIC_APP_URL` was unset. They now
  use `siteUrl()`.
- **Wallet switched to the wrong chain.** The wallet always connected and
  switched to testnet while the button named the deployment's network. It now
  follows the same variable as the label.
- **Hardcoded testnet or one-network copy:**
  - The operator hire alert always linked to the testnet explorer.
  - The terms named one network.
  - The faucet step said "BNB" on a mainnet build.
- **Wallet totals mixed money.** The wallet page added real and test $U
  together; they are now kept apart.
- **Smaller fixes:**
  - The methodology table of contents was missing the health factor section.
  - Operator pages had no description.
  - Sync of an unindexed job answered 200.
  - The trial route's comment was wrong.
- **Branch housekeeping.** Three commits sat on local `main` and were never
  pushed: the fixture rewrite, the v3 position sampler and the paid
  position-range check. They are cherry-picked into this branch so they ship
  together. Local `main` has also diverged from `origin/main` (22 behind), so
  it should be reset to `origin/main` once this merges.

## Open, recorded rather than fixed

| Gap | Why it is not in this branch |
| --- | --- |
| Does a quorum rejection refund automatically, or must the buyer call `claimRefund`? | The commerce contract is not verified on Sourcify and no REJECTED job exists yet. The copy holds either way and keeps a reclaim button. Confirm on the first real rejection. |
| ~~Raw RPC and SDK error text passed through on public routes~~ | **Fixed 16 Oct** (`fix/api-errors`): 13 public routes now pass errors through `publicErrorMessage`, which keeps the reason and drops viem detail lines, query strings, private hosts, secret names and commands. The full error is logged. Operator-only routes keep full detail. |
| ~~`notifications/subscribe` and `follow` return every error as 400~~ | **Fixed 16 Oct**: validation is `BadRequest` (400); provider and config faults are 502 with a generic message. Review report and moderate return 404 only for not-found, 500 otherwise. |
| Inconsistent error shapes: `{status:'refused', reason}`, `{reclaimed:false, error}` | Changing shapes breaks clients. Needs versioning. |
| ~~Sponsorship daily limit answers 409, not 429~~ | **Fixed 16 Oct**: 429 with `retry-after`. The client reads only the body, so nothing else changed. |
| Two `IS_TESTNET` flags (server `ALTANA_NETWORK`, client `NEXT_PUBLIC_ALTANA_NETWORK`) can disagree | Deployment config. Production sets both. **16 Oct:** the server now logs a `[config]` error at boot when they disagree. |
| Hosted assistants share `get_quote`'s 5-per-minute IP limit | Needs a per-session MCP key. Documented in the tool description for now. |
| Passkey reclaim builds the call for `WALLET_NETWORK`, not the job's chain | Passkey wallets act on one chain only. Matters only if that changes. |
| `MCP_ENDPOINT` hardcodes pokter.xyz | Intentional for the public docs. Staging advertises production. |

## Outside the code, for the team

- Reclaim jobs 56994 and 56995 now.
- On 22 Oct, reclaim 56996, and 56997 if its dispute does not reach quorum;
  57005 settles.
- Fund the category fixtures above, if wanted.
- Record the assistant journey after deploy.
- Reset local `main` to `origin/main` after merge.
