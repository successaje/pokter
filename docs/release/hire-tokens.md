# Hiring in tokens other than $U

Status as of 26 October 2026: **built, tested on local forks and a local build, and off.** No hire has been funded in another token through Pokter. Nothing is turned on by this change; `fly.toml` is untouched.

## Scope: one flow for verified tokens

There is no USDT-specific path. A token is hired in by the same flow as any other, and only if all of these hold:

1. **It is in the registry** (`src/lib/network/tokens.ts`) by chain and address, with decimals read from the contract.
2. **The deployed escrow reports it supported** (`isPaymentTokenSupported`). This is recorded in the registry and asked again before every hire.
3. **It is marked `hireEligible`.** That means the whole job lifecycle has been run against the deployed escrow in that token (`tests/fork/usdt-lifecycle.fork.mts`).
4. **It is turned on** in `NEXT_PUBLIC_HIRE_TOKENS`, as `chainId:address` pairs. This is unset everywhere.

An entry that fails any of these is ignored, so a typo or an unvetted token cannot become payable.

| Token | Chain | Escrow supports | Eligible | On |
| --- | --- | --- | --- | --- |
| $U | 56, 97 | yes | default | always |
| USDT `0x55d3…7955` | 56 | yes | yes (fork lifecycle 22/22) | no |
| USDT `0x3376…4dDd` | 97 | yes | yes (fork lifecycle 22/22) | no |
| USDC `0x8AC7…580d` | 56 | yes | no: lifecycle not run | no |
| USDC `0xEC1C…DE47` | 97 | no | no | no |
| USD1 `0x8d0D…8B0d` | 56 | yes | not in the registry: its address is unverified | no |

The hire's token is the one the seller **signed**. It is never chosen by the buyer, and it is funded at exactly the signed amount: never rounded, converted or swapped into, and never funded as $U instead.

## Which paths fund which token

`src/lib/network/hire-paths.ts` holds this table, and the hire flow reads it before any wallet is asked.

| Path | $U | Other eligible tokens |
| --- | --- | --- |
| Browser wallet, one transaction at a time | yes | **yes** |
| Browser wallet, one atomic batch (`wallet_sendCalls`) | yes | **no.** Not exercised end to end; such hires are sent one transaction at a time. |
| Passkey wallet | yes | **no, refused by name.** It funds through the SDK, which only creates $U jobs. |
| Server hire (`hireAgent`) | yes | **yes**, given the signed token and amount. No public route passes them. |
| Prepared hire (`prepare_hire`) | yes | **yes**, only when the owner names the token (`payment_token`); the ceiling is counted in it. |
| Requests board and proposals | yes | **no.** Budgets and bids are $U. |

## When funding does not end cleanly

The browser keeps a funding journal (`src/lib/hire/funding-journal.ts`), per wallet and chain, in local storage:

- **What is persisted, and when.** The attempt is written before the first wallet prompt, with the predicted job id, the description, the token and the amount. The batch id, every transaction hash (the moment the wallet returns it, before waiting for the receipt) and the job id a receipt proves are added as they arrive.
- **Ambiguous outcomes stay pending.** A timeout, a receipt that never came, a lost reply, or a token read that failed after funding is pending reconciliation. It is not a failed hire.
  - The page says so on every step and checks the chain with receipts by hash, the batch status, the job id, and a window of ids after the prediction.
  - **Funded:** the job is adopted (recorded, indexed, the seller told) and never funded again.
  - **Not funded:** the attempt is closed, and nothing moved.
  - **Anything else:** stays pending.
- **Another commission is blocked** from that wallet while an attempt is open: across clicks, tabs and reloads.
- **Reload or retry recovers the existing job** rather than creating another. A job that was created but never funded holds no money; it is reported and left, and the next hire creates a new one.
- **A refusal in the wallet before anything was handed back** closes the attempt, because nothing was sent.
- **Funded, but the token read fails.** It is retried three times. If it still cannot be read, the hire is recorded as funded with its token unknown, and the sweep reads it later. Only a token that reads back as different is an error, and its message says not to fund again.

## Records, receipts and totals; rollback

- Each job stores its token: recorded at funding, read from `jobPaymentToken` when indexed, and filled by the sweep and by `POST /api/jobs/backfill-currency`. The backfill is a dry run unless `{"write": true}` is sent, and it reports unread rows.
- **Unknown stays unknown, whatever the flag.** Only a positively identified token gets a label or counts toward a figure.
  - A job whose token has not been read shows its base units, marked "currency not yet read".
  - It is not counted in any $U figure.
  - It has its own bucket in per-token totals.
  - Turning tokens off relabels nothing, so a rollback cannot fold USDT into $U. `tests/hire-tokens.test.mts` pins this.
- **Consequence at deploy:** until the backfill runs, older jobs show "currency not yet read", and the published $U figures count only jobs whose token has been read. The backfill is step 2 below and must run right after the deploy.
- Receipts carry `token`, `symbol` and `amount`; `amountU` is null for a non-$U job. Provider earnings give one line per chain and token. No figure adds two currencies together.

## Tests

- **`tests/hire-tokens.test.mts`** (16). It covers:
  - turning a token on by chain and address, and ignoring ineligible entries
  - the offered set, escrow selection and the settlement hint
  - the token decision
  - the encoded batch, decoded call by call
  - refusals, the escrow support check, and the exact amount and expiry
  - labels, per-token totals and the **rollback** case
  - provider earnings, the backfill, and the Evidence agent's token choice
- **`tests/hire-funding.test.mts`** (16):
  - the planner: a USDT price plans the signed amount with batching off, and $U is unchanged
  - **passkey refusal** and ineligible tokens
  - the support table
  - the **final payment screen** copy for USDT (no "$U" anywhere) and for $U (unchanged)
  - the page renders amounts and buttons from the plan and the job
  - **token propagation through the hire hook**, and the funded-job record
  - **funded but the token read fails**
  - **repeated clicks** and **reload**
  - **receipt timeout**
  - a lost batch reply, and the rules for closing an attempt
- **`tests/routes/usdt-job-store.route.test.mts`:** a production-shaped table gains the column. Unknown is not $U. A later record does not erase the token. The backfill writes only what it read.
- **Fork lifecycle** (`tests/fork/usdt-lifecycle.fork.mts`, anvil, nothing broadcast): 22/22 on BNB Testnet and on BNB Chain mainnet. It covers funding, release, dispute and refund, expiry and reclaim, a partial failure and retry, a double fund, an unsupported token and an expired quote.
- **Local flag-on build, in a browser**, with a stand-in wallet that answers reads and refuses every signing method, so nothing could be signed:
  - IVL Rebalancer's (56/341628) signed 1 USDT carried through review to the **final payment screen**: "USDT to pay with 0.00" (the wallet's real balance), "Short of the signed price. Pokter does not swap into USDT", "Pay 1 USDT into the escrow contract 0xEa4D…EBA6", and "Fund escrow · 1 USDT".
  - The header named "Real USDT" before the quote.
  - After a reload with an open attempt in the journal, the page showed "An earlier funding attempt is being checked" with the expected job and transaction, and funding was blocked.

## Release checklist (in order; nothing here is done yet)

1. **Merge with nothing turned on.**
2. **Backfill job currencies.** Run `POST /api/jobs/backfill-currency` as a dry run, read the report, run it with `{"write": true}`, and repeat until `remainingUnknown` is 0 or every remaining row is explained. Check that the proof page's $U figures match before and after.
3. **Staging end to end.** Do this on a staging build with `NEXT_PUBLIC_HIRE_TOKENS=97:0x337610d27c682E347C9cD60BD4b3b107C9d34dDd` and `NEXT_PUBLIC_ESCROW_CHAINS=97`, and with the staging Evidence agent's `EVIDENCE_QUOTE_TOKEN` set to the same address. Using a real browser wallet holding testnet USDT:
   - Hire Pokter Evidence from the hire page through the final payment screen and fund it.
   - Confirm the job reads FUNDED, `jobPaymentToken` is USDT, the success screen and receipt say USDT, and the delivery arrives.
   - Release after the review window, and read the earnings line in USDT.
   - Also confirm: a passkey wallet is refused; a reload mid-funding recovers; a second click is blocked.
4. **Mainnet, in staging, with a small real USDT hire** of an agent that signs in USDT. Same checks.
5. **Only then** add the pairs to `[build.args]` in `fly.toml` and deploy. To roll back, remove them and redeploy: labels and totals do not change.

## Remaining gaps

- The funding journal is per browser. Another device sees a recovered job through the index (the sweep finds it), but its own new hire is not blocked by an attempt open elsewhere.
- The connect dialog still offers a passkey wallet on a signed-token hire. The payment screen then refuses it by name before anything is asked.
- Atomic batches for other tokens are switched off, not tested.
- No swap into another token.
- The requests board, proposals and provider tools are $U only.
- The server path's relay execution has not been run.
- A few displays assume eighteen decimals. That is true of every eligible token, but must change before any token with other decimals becomes eligible.
- `scripts/usdt-rehearsal.mts` prepares a testnet hire to the wallet step. The hire page cannot reach a local agent, because quotes go to the agent's registered endpoint and private addresses are refused, so the hire-page rehearsal is step 3 above, on staging.
