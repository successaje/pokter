# USDT hiring: what it does, how it was tested, and how to turn it on

Status as of 26 October 2026: **built and tested on local forks of both
escrows; off.** No USDT job has been funded through Pokter. Turning it on is
`NEXT_PUBLIC_USDT_HIRING_ENABLED = 'true'` under `[build.args]` in `fly.toml`,
and is not done in this change.

## What the escrow already supports

Read from the deployed contracts, not assumed:

| | BNB Chain (56) | BNB Testnet (97) |
| --- | --- | --- |
| Escrow (proxy) | `0xEa4DAa31…EBA6`, implementation `0xe8d47866…d533` | `0xa206c051…B0DE`, implementation `0x55c3826b…1421` |
| `createJobWithToken`, `jobPaymentToken`, `isPaymentTokenSupported` | yes | yes |
| USDT supported | `0x55d39832…7955`, 18 decimals | `0x337610d2…4dDd`, 18 decimals |
| Dispute policy | holds no token; disputes and refunds settle in the job's token | same |

Of the last 400 mainnet jobs, 23 were funded in USDT by other buyers. Six
completed and paid out, so the whole lifecycle already works on chain.

## The rule

- **The token is the one the seller signed.** It is never chosen by the buyer and never defaulted. A USDT price funds USDT for exactly the signed amount, in base units. Nothing is rounded, converted or topped up.
- **Tokens are matched by chain and address** against `network/tokens.ts` and confirmed with the escrow's `isPaymentTokenSupported` before anything is signed. Only USDT is added; USDC and USD1 are not offered.
- **`$U` is untouched.** A `$U` price takes the same path as before (the SDK's `buildHireCalls`). With the flag off, every function returns what it returned before, and the tests pin that.

## Paths

| Path | USDT |
| --- | --- |
| Browser wallet (`wallet/external.ts`) | Funded. It checks the escrow accepts the token, reads the balance and approval in USDT, and offers no swap. It builds `createJobWithToken` and an approval of exactly the budget in USDT, then confirms the funded job is bound to USDT before calling it a success. |
| Passkey wallet | **Refused by name.** It funds through the SDK's `hireErc8183Agent`, which can only create a `$U` job. |
| Server hire (`erc8183/hire.ts`) | Funded when `paymentToken` and `amountRaw` are passed, with the same checks. No route passes them today, so the admin routes remain `$U`-only. |
| Prepared hire (`prepare_hire`, `/api/hire/prepare`) | Prepared only when the owner names the token (`payment_token`, which appears in the tool schema only while the flag is on). `max_budget` is then counted in USDT. A USDT price without it, or a token other than the one named, is refused with `token-not-in-mandate`. |

## Records, deliveries, receipts and totals

- Each job stores its token (`payment_token`). It is recorded at funding, read from `jobPaymentToken` when indexed, and filled in by the sweep while it is unknown. A failed read leaves it null.
- **Backfill:** `POST /api/jobs/backfill-currency` with the sweep secret. It is a dry run unless the body has `{"write": true}`, and it reports read and unread rows. An unread row stays unknown and is listed for the next run; it is never relabelled `$U`.
- The reference-delivery check compares the quote with the job's own token, and declines when that token cannot be read.
- Receipts carry `token`, `symbol` and `amount`. `amountU` is now null for a non-`$U` job.
- `$U` figures (activity, proof, economic history, builder earnings) count only `$U` jobs. Every token has its own per-chain total (`valueByToken`, `completedByToken`, `fundedByToken`), and unknown tokens get their own bucket. Provider earnings give one line per chain and token. **No figure adds two currencies together.**
- While the flag is off, rows with no token keep their `$U` label. Only `createJob` has ever funded a Pokter job, so pages do not change before the backfill. Once the flag is on, an unknown token is shown as unknown.

## How it was tested

- **Unit:** `tests/usdt-hiring.test.mts` (15 tests). It covers:
  - the flag
  - which tokens are offered
  - escrow selection
  - the settlement hint
  - the token decision
  - the encoded batch, decoded call by call
  - refusals
  - the escrow support check
  - exact-amount and expiry checks on the purchase intent
  - labels and per-token totals
  - provider earnings
  - the backfill
  - the Evidence agent's token choice
- **Store, on a real SQLite file:** `tests/routes/usdt-job-store.route.test.mts`. It covers:
  - a production-shaped table gaining the column and keeping its rows
  - unknown is not `$U`
  - a later record without the token keeps it
  - the backfill writes only what it read
- **Delivery:** `tests/reference-delivery.test.mts` adds the case where the token cannot be read.
- **Lifecycle on a local fork** (`tests/fork/usdt-lifecycle.fork.mts`, needs anvil; `FORK_CHAIN=56` for mainnet). It drives Pokter's encoder and job-id parser against the deployed contracts, with nothing broadcast. It passes 22/22 on both chains:
  - funding binds the job to USDT
  - exactly the budget moves
  - no `$U` is touched
  - no allowance is left behind
  - release is refused inside the review window, then pays the provider in USDT
  - a disputed delivery rejected by the voters refunds the buyer in USDT, applied through the router
  - an expired job is reclaimed in USDT, and a reclaim before expiry is refused
  - funding with too little approved reverts, the job stays OPEN with nothing taken, and the retry funds the same job without creating a second one
  - a repeated fund is refused
  - an unsupported token is refused at creation
  - a quote expiring inside the funding margin stops the hire

## Testnet rehearsal (prepared; stops before the wallet)

There was no compatible provider: no testnet agent signs in testnet USDT. Pokter Evidence (97/2599) can do it with `EVIDENCE_QUOTE_TOKEN` set, which is unset in production. It then prices in USDT only when the buyer's hint lists USDT.

1. Start the local server `pokter2-usdt-rehearsal` from `.claude/launch.json`. It runs with the flag on, `EVIDENCE_QUOTE_TOKEN` set to testnet USDT, and `ALTANA_ADMIN_KEY` from `.env.local`, which is the Evidence agent's registered key.
2. Run `BUYER=0x… npx tsx scripts/usdt-rehearsal.mts`. It:
   - gets the agent's signed USDT price
   - checks it as the quote route does
   - confirms the escrow accepts USDT
   - reads the buyer's USDT balance and gas
   - prints the five exact calls
   - simulates the creation and the approval against live testnet
   - stops before any approval, signature or broadcast
3. The wallet part (yours):
   - fund the buyer with at least 0.01 testnet USDT
   - sign the five calls in that order
   - check the job reads FUNDED and `jobPaymentToken` is USDT

Doing this from the hire page needs a flag-on build where the Evidence agent quotes USDT. Quotes go to the agent's registered endpoint, which is production, and the quote path refuses private addresses, so a local server cannot route a hire page to its own agent.

**Seen on a flag-on local build:** IVL Rebalancer (56/341628) signs in mainnet USDT. The quote route accepted its signed 1 USDT and routed it to the mainnet escrow. The review screen said "1 USDT, exactly the signed price", and its permissions said "Move exactly 1 USDT into the escrow contract 0xEa4D…EBA6". Nothing went past the review step.

## Before turning it on

1. Merge this with the flag off and let the deploy finish.
2. Run the currency backfill as a dry run, read the report, then run it with `{"write": true}`. Repeat until `remainingUnknown` is 0, or every remaining row is accounted for.
3. Complete the testnet rehearsal above with a real wallet.
4. Only then set the flag and deploy.

## Remaining gaps

- Atomic `wallet_sendCalls` batches were not exercised on the fork, because anvil does not support them. They use the same encoded calls, but the batch path is untested end to end.
- No unit test covers the passkey refusal or the browser hook's token threading. They are code-level guards.
- The server path's relay execution was not run, because it needs the production relay.
- Pokter does not swap into USDT: a buyer short of USDT is told and nothing is sent.
- The requests board, proposals and the provider tools (`price_u`) are still `$U`-only. A USDT agent can be hired on its own signed price, but not through a request.
- Some displays still format at 18 decimals without a symbol, which is correct for both offered tokens: the agent profile's last price, the provider MCP's `budgetU`, and the studio inbox. They should read the job's token before any token with other decimals is offered.
- `get_quote` reports a USDT price as fundable while the flag is on. `prepare_hire` then needs `payment_token`, so an assistant has to ask the owner for it.
