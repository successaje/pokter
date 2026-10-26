# Hiring in verified tokens

Status on 26 October 2026: **code-complete and off.** It is tested on local forks, in unit and route tests, and in a local flag-on build with a wallet that cannot sign. No hire has been funded in a token other than $U through Pokter. `NEXT_PUBLIC_HIRE_TOKENS` is unset everywhere and `fly.toml` is untouched.

| Stage | State |
| --- | --- |
| Code-complete | **Yes.** Everything below is built and tested as described, and an independent review's findings are resolved (section 8). |
| Staging-validated | **No.** It needs the staging app and the wallet rehearsal of section 9, option A. |
| Production-enabled | **No.** No currency is turned on, and nothing is funded or broadcast. |

## 1. Supported currencies, from evidence

A token can be hired in only when every check passes. There is one registry (`src/lib/network/tokens.ts`) and one funding flow; there is no per-token code path.

1. **Exact address and decimals.** The registry is keyed by chain and address, and the decimals are read from the contract.
2. **Identity, with its source.** Each token is recorded as issued by its issuer, a bridged peg, or a test token. The disclosure is shown wherever the token is paid.
3. **The deployed escrow supports it.** The escrow reports `isPaymentTokenSupported` as true, and `createJobWithToken` simulates. This is recorded at block 128973013 (56) and 138113102 (97), and asked again before every hire.
4. **The lifecycle has run on a fork of the deployed escrow** (`tests/fork/usdt-lifecycle.fork.mts`) in that token. Only then is the token marked `hireEligible`.
5. **It is turned on** as a `chainId:address` pair in `NEXT_PUBLIC_HIRE_TOKENS`. Anything not eligible is ignored, so a typo cannot become payable.

| Token | Chain | Address | Dec. | Identity and source | Escrow | Fork lifecycle | On |
| --- | --- | --- | --- | --- | --- | --- | --- |
| $U | 56 | `0xcE24…6666` | 18 | Issuer: United Stables. u.tech lists this address for BNB Smart Chain | default | 23/23 (the "$U untouched" step does not apply) | always |
| USDT | 56 | `0x55d3…7955` | 18 | **Binance-Peg BSC-USD, not issued by Tether.** Tether's supported-protocols page lists only XAU₮ for BNB Smart Chain | yes | 24/24 | no |
| USDC | 56 | `0x8AC7…580d` | 18 | **Binance-Peg USD Coin, not issued by Circle.** Circle lists no BNB Smart Chain deployment. Note 18 decimals, unlike Circle's 6 | yes | 24/24 | no |
| USD1 | 56 | `0x8d0D…8B0d` | 18 | Issuer: World Liberty Financial. docs.worldlibertyfinancial.com lists this address for BNB Smart Chain | yes | 24/24 | no |
| $U | 97 | `0xc70B…5565` | 18 | Test token: the testnet escrow's default; no issuer lists it | default | 23/23 (the "$U untouched" step does not apply) | always |
| USDT | 97 | `0x3376…4dDd` | 18 | Test token with no value; no issuer lists it | yes | 24/24 | no |

**How the pegs are named.** Wherever a currency is chosen or confirmed, the BNB Chain pegs are called **Binance-Peg USDT** and **Binance-Peg USDC**, never plain "USDT" or "USDC". That covers the hire page's currency choice, the review, the payment confirmation and fund button, a request's "Paid in" choice, the request page, and the limit and shortage messages. The chain and the full contract address are shown beside the name (`tokenIdentity`). They are not presented as interchangeable with Tether's or Circle's own coins.

**Unsupported, and why:**

- **USDC on 97** (`0xEC1C…DE47`). The testnet escrow rejects it: `isPaymentTokenSupported` is false, and `createJobWithToken` reverts with `UnsupportedPaymentToken`. It is also an unofficial 6-decimal test token.
- **USD1 on 97.** No contract exists there, and World Liberty lists no testnet deployment. It was validated on a mainnet fork only, so live validation must be on mainnet. No testnet stand-in was invented.

No token is described as universally hireable. A token is offered only on the chain where it passed, and a hire is funded in it only if the agent signs in it.

## 2. The buyer and provider journey

- **Discovery, pricing and the profile.** Every price is labelled in the token it was signed in, with the exact signed amount. There is no rounding to cents and no 18-decimal assumption. A price with no recorded token reads "(currency unknown)", never $U.
  - The profile says what was last signed and that another currency can be asked for. It does not claim an agent accepts "only" one currency.
- **Preferred currency, before negotiation.** On the hire page, "Ask the agent to price in" lists the tokens Pokter funds on that escrow chain. The preference travels outside the signed terms, as `preferred_currency` in the settlement hint.
  - The agent signs a **new quote** in whatever it accepts.
  - If it signs in something else, the review screen says so: "You asked for USDT; Pokter Evidence signed its price in $U, so it may accept only certain currencies…" The buyer then funds that or chooses another agent.
  - A signed price is never converted, relabelled or changed.
- **Pokter's own agents honour the preference.** That covers the house agents and Pokter Evidence (`quoteTokenFor`). The rehearsal shows it: asked for USDT, Evidence signed 0.01 USDT, and the signature recovered to the registered wallet.
- **Requests and proposals.** A request names its token, and a proposal must be in that token. They are compared in raw units, and the signed text names the token, address and chain.
  - A $U request or proposal signs the same bytes as before, so old signatures verify.
  - The board sorts budgets per token and never compares across tokens.
  - A proposal in USDT carries its token and raw price into the hire. A quote in a different token, or above the proposed price, is refused.
- **Checkout and funding.** The plan funds exactly the signed amount in the signed token, and the review and payment screens print it from its raw units. Budget limits are per token: 0.01 to 5 whole units, in that token's own decimals. An out-of-range signed price is refused, never trimmed.
  - Before the wallet opens, the payment screen shows the token balance, the gas balance, the network, the escrow and recipient, and an approval of exactly the amount.
  - When the buyer is short, it says so: "Pokter does not swap into USDT; add USDT to this wallet".
- **After funding.** Status, delivery, review, dispute, settlement, refund and receipts all read the job's own token.
  - Receipts carry the token, symbol and raw amount, and `amountU` is null for a non-$U job.
  - Earnings and proof are per chain and token.

## 3. Entry points

`src/lib/network/hire-paths.ts` holds the wallet and path table, and the hire flow reads it before any wallet is asked.

| Path | $U | Other eligible tokens | Detected before payment, with an alternative |
| --- | --- | --- | --- |
| Browser wallet, one transaction at a time | yes | **yes** | n/a |
| Browser wallet, atomic batch (`wallet_sendCalls`) | yes | **no**: switched off, not exercised | Falls back to one transaction at a time |
| Passkey wallet | yes | **no**: the SDK only creates $U jobs | The connect dialog disables it with the reason and offers a browser or phone wallet |
| Server / relay hire (`hireAgent`) | yes | yes, given the signed token and amount; no public route passes them | n/a |
| Prepared hire (`prepare_hire`) | yes | yes, when the owner names `payment_token`; the ceiling is counted in it | Refused by name when the token is not offered |
| MCP `get_quote` | yes | takes `preferred_currency {escrow_chain_id, token}`; reports `preference.honoured` | Refused (`preference-not-offered`) when Pokter does not fund the token there |
| MCP `hire_link` | yes | takes `preferred_token`, passed as `?pay=`; used only if offered on that chain | Ignored when not offered |
| Requests board, proposals, provider MCP (`find_requests`, `prepare_proposal`, `submit_proposal`, `list_work`, `report_earnings`) | yes | **yes**: the request's token throughout | A proposal in another token is refused, naming the token |

The schemas, limits, the integration kit, the builder AI prompt and the examples now give each escrow's tokens with their decimals, the `preferred_currency` field, and "price in the token's own decimals, never assume 18".

## 4. Payment recovery

Identifiers are persisted **before** any waiting. The browser journal (`src/lib/hire/funding-journal.ts`, per wallet and chain) records:

- the attempt, before the first prompt;
- the prompt step, before every wallet request;
- every transaction hash, the moment the wallet returns it, including a hash that replaces it;
- the batch id and the predicted and proven job ids.

| Situation | Behaviour |
| --- | --- |
| Repeated clicks, simultaneous starts | One attempt per wallet and chain, under an exclusive Web Lock; a second start is refused |
| Two tabs | Only the owner tab can prompt or close. Before every prompt the owner proves the record is still its own, and a lost or replaced record stops before the wallet is asked |
| Reload, closed tab | The record is picked up on load and checked against the chain. Nothing new is funded meanwhile. A second check while one is running in the same tab is skipped, so it never reports a phantom "other tab" |
| Rejected prompt | If this session sent nothing, the attempt closes and the server record closes as `nothing-sent`. "Sent" is this session's own record of hashes handed to the chain, so losing ownership after a hash came back never counts as nothing sent |
| Partial execution (created, not funded) | A created job is unfunded whatever its budget says (`createJob` starts at 0). While a fund prompt may still be open, **"Finish funding job N"** resumes **that** job, with its own token, amount and on-chain deadline. If no money-moving prompt was outstanding (rejected at budget or approval), the attempt closes and the empty job is left: it holds nothing, and the next hire creates a new one |
| RPC failure, receipt timeout, lost batch reply | **Pending, not failed.** The chain is checked by hash, batch status, job id and a window after the prediction. An unknown outcome never invites a fresh payment |
| Transaction replaced (speed-up or cancel) | The replacement hash is recorded. A replaced hash is not treated as in flight, and the job read decides |
| Funded, but the token read fails | Recorded as funded with the token **unknown**. The sweep and the backfill read it later |
| Abandoned attempt | Closed only on **proof** that no payment can follow: no money-moving prompt was issued, or the chain is past a deadline proven for this attempt (the escrow then refuses `fund` and `createJobWithToken`, as checked on a fork). **Elapsed time alone never unlocks anything.** |
| Where the deadline comes from | Exactly what the wallet was asked to sign. A browser-wallet hire records the `expiredAt` it encodes before the first prompt. A resume records the job's on-chain `expiredAt`. A passkey hire records an upper bound taken just before the SDK computes its own (the SDK's clock plus the dispute window plus delivery, with a 10-minute margin); if the dispute window cannot be read, the hire stops before any prompt. A job found on chain proves its own `expiredAt`. **A fund or batch prompt cannot be issued without a recorded deadline** (`DeadlineNotRecorded`, refused before the wallet is asked) |
| Another hire of the same agent | Never mistaken for this attempt: a job counts only with the same client, provider **and** description (brief plus signed quote) |
| Funded in a different amount (mismatch) | The job is **kept**: adopted, recorded and indexed with the amount the escrow actually holds, and shown as the hire's result with a warning. Its signed quote is marked spent, so the same quote can never fund another job, even after a reload (`already-funded`). Only then does the record stop blocking |
| Funded, by any path | The quote is marked spent in this browser: a later attempt with the same brief and signed quote is refused before any prompt. A fresh quote is a new hire |
| A transaction stuck past the expiry | Closed: past the expiry nothing in flight can create or fund the job |
| Recovered funded job | Adopted with the escrow's own `expiredAt`, never the recovery time |

**Cross-device.** `/api/hire/attempts` and `src/lib/hire/remote-attempts.ts` hold one open record per wallet and chain, mirrored from the browser journal.

- **What it prevents:**
  - a second device starting a hire while another device's attempt may still pay, once the chain shows that attempt's own create transaction;
  - a funded job being missed because the funding device went away. The server reconciles, closes the record, and indexes the job, with its token, for every device.
- **What it cannot prevent:**
  - payments made outside Pokter, or from a device that never reached the server;
  - two devices signing within the same instant;
  - a second device acting while the first has only begun and sent nothing yet (it is warned, not blocked);
  - a batched hire (`wallet_sendCalls`, $U only): the batch goes to the wallet's own account, so the server cannot verify it, and it warns rather than blocks. The browser journal still protects that browser.
- **Abuse resistance.** Writes are unauthenticated, so a record **blocks** only once it is verified. Verified means the chain shows a create transaction:
  - from the wallet;
  - to the escrow;
  - sent after the record began;
  - whose description is the attempt's own.

  The description carries the brief and the agent's signed quote, which nobody else can know in advance.
  - An old transaction, an approval, or another hire's job proves nothing.
  - An unverified record never blocks. It is a warning, and the next device to begin **replaces** it, so nobody can lock another person's wallet by posting attempts in its name.
  - Closing needs the attempt's secret or chain proof. Prompts are checked against the known steps.
  - A verified record's deadline is the `expiredAt` **decoded from that same create call**, never a value a client sent.
  - Other devices see no brief and no secret.
- **No lock without a way out, and no unlock without proof.** The server closes a record only when the chain shows its payment can no longer happen:
  - it was funded;
  - it was funded in another amount (the job is indexed and kept);
  - no money-moving prompt is outstanding and nothing is funded;
  - the chain is past its proven deadline.

  A record that blocks is verified, so its deadline is always known from its create call.

## 5. Accounting and rollback

- **Every job stores its chain, token address and raw amount.** The token comes from the funding record, `jobPaymentToken` at indexing (indexing on funding notice and reconciliation through `indexIfMissing`, house delivery, `/api/jobs/index`, `/api/jobs/backfill`, `/api/jobs/[jobId]`, the attempts endpoint when it finds a funded job), the campaign indexer, the sweep, and the backfill.
- **Unknown stays unknown, whatever the flags.** A job whose token was not read shows its raw units as "currency not yet read". It is not counted in any $U figure and has its own bucket in per-token totals.
- **Never added together.** Proof, activity (`valueByToken`), earnings, workspace totals, the receipt verifier (`completedByToken`), the studio and the assistant all give one line per chain and token.
  - Testnet value is "test money", never revenue.
  - The verifier's old `byChain[].completedValueRaw`, which summed across tokens, is replaced by `completedByToken`. This is a format change for anyone parsing it.
- **Rollback is safe.** Turning tokens off relabels nothing. Past USDT jobs stay USDT and are never folded into $U. Bids on a USDT request stay valid against that request's token.

## 6. Backfill procedure

`POST /api/jobs/backfill-currency` takes `Authorization: Bearer $SWEEP_SECRET` and a body of `{ write?, limit? (≤500, default 200), after?, runId? }`. It reads `jobPaymentToken` for every job whose token is null, in id order.

1. **Dry run.** Send `{}` and read the report: `examined`, `read`, `unread`, `byToken`, each reading, `nextCursor` and `remainingUnknown`. Nothing is written and nothing is audited.
2. Record the proof page's $U figures.
3. **Write run.** Send `{"write": true, "runId": "<name>"}`, then repeat with `"after": <nextCursor>` until `nextCursor` is null.
   - Each job gets one row in `currency_backfill_audit`: `written`, `already-set` or `unread`, with the reason.
   - The run is resumable from any cursor. A repeated page is harmless, because a write only fills a null.
4. **Unread rows stay null.** Restart from the beginning (no `after`) to retry them. Repeat until `remainingUnknown` is 0, or every remaining row is explained in the audit.
5. Compare the proof page's $U figures. They can only grow: previously unknown $U jobs are now counted. Any USDT job appears on its own line.

Briefs and bids written before this change keep a null token, which reads as $U, because their signed text literally says $U. Campaign `escrow_jobs` rows from before this change keep a null token, and nothing sums them.

## 7. Rollback procedure

1. Remove the pairs from `NEXT_PUBLIC_HIRE_TOKENS` (from `[build.args]` in `fly.toml`, once they are ever added) and redeploy.
   - New hires and requests can then only be in $U.
   - Existing jobs keep their token, labels and totals, and nothing is relabelled.
   - Open attempts finish on their own job.
2. To revert the code as well, revert the merge. The added columns (`payment_token`, `budget_raw`, `price_raw`) and tables (`funding_attempts`, `currency_backfill_audit`) are additive and nullable, and older code ignores them. No down-migration is needed.

## 8. Test evidence

Every case is marked: **E** executed against real code and chain state, **S** simulated (an `eth_call` or a local anvil fork, nothing broadcast), **M** mocked (named), or **N** not tested.

### Token × network × path

| Case | $U 56 | USDT 56 | USDC 56 | USD1 56 | $U 97 | USDT 97 |
| --- | --- | --- | --- | --- | --- | --- |
| Address, decimals and escrow support read on chain | E | E | E | E | E | E |
| Fork lifecycle (list below) | S 23/23 | S 24/24 | S 24/24 | S 24/24 | S 23/23¹ | S 24/24 |
| Planner, exact amount, per-token limits, wrong-token rejection | E (unit) | E (unit) | E (unit) | E (unit) | E (unit) | E (unit) |
| Browser wallet: review → payment screen → prompt **rejected** | N | N | N | N | E | **E + M²** |
| Browser wallet: approved and funded | N | N | N | N | N | N: **wallet rehearsal** |
| Atomic batch | existing | N: off | N: off | N: off | existing | N: off |
| Passkey | existing | refused (unit) | refused (unit) | refused (unit) | existing | refused (E, UI) |
| Server / relay hire | unit | unit | unit | unit | unit | unit; relay execution N |
| Prepared hire, MCP `get_quote` / `hire_link` | unit | unit | unit | unit | unit | unit + E (`?pay=`) |
| Requests and proposals, provider MCP | unit + route | unit + route | unit | unit | unit + route | unit + route |

The fork lifecycle covers:

- creating the job with the token, and `JobPaymentTokenBound`;
- funding exactly; the escrow holds it, and no allowance is left;
- submission;
- release refused inside the review window, then release paying in the token;
- dispute, quorum reject and refund;
- reclaim refused before expiry, then reclaim after expiry;
- under-approval reverts and the job stays OPEN;
- a retry funds the same job, and a double fund is refused;
- **resume after registration funds the existing job and creates none**;
- an unsupported token is refused;
- an expiring quote stops the hire.

¹ Testnet $U has had no transfer in tens of thousands of blocks, so the harness found no holder to borrow from. It now impersonates the escrow, which holds every funded budget, **on the fork only**. The "$U untouched" step does not apply to a $U run.

² **Mocked:** the `/api/hire/quote` transport in the page only (see below).

### Browser, local flag-on build (`NEXT_PUBLIC_HIRE_TOKENS=56:USDT,97:USDT`)

The wallet was a stand-in injected into the page. It answers account and chain reads, proxies reads to public BNB Testnet RPC, and **rejects every signing method with 4001**, so nothing could be signed or sent.

- **Preference not honoured.** Real path, production agent endpoint: asked for USDT, the agent signed 0.01 $U, and the notice was shown (`01`).
- **USDT hire: an integration test with intercepted quote delivery, not an end-to-end pass.** The quote is a **real** USDT quote signed by the local Evidence handler with the agent's registered key. **Mocked:** the `/api/hire/quote` transport in the page, because the hire page sends quotes to the agent's registered production endpoint, which does not run this branch. Agent discovery and the live quote hop are therefore not covered here; option A covers them.
  - Review: "0.01 USDT … nothing else is converted" (`02`).
  - Fund step: "paid in test USDT … from a browser or mobile wallet" (`03`).
  - The passkey option is disabled with its reason (`04`).
  - Short wallet: "USDT to pay with 0.00 … Pokter does not swap into USDT", and the fund button is disabled (`05`).
  - Funded address with 2.37 test USDT (real balance, read-only): ready to fund, exact approval stated (`06`).
  - **Wallet rejection** (mobile, 375px, no horizontal scroll): "You declined in the wallet. Nothing was sent and no funds moved." The journal was cleared, and the cross-device record went through begin → update → close with nothing left open (`07`).
- **Return after an interruption.** A seeded journal record for an attempt at the fund prompt, with an unknown transaction, from a closed tab. On load: "An earlier funding attempt is being checked … A transaction from this attempt is not mined yet", and funding is blocked (`08`).
  - Before a fix in this release, the same screen wrongly said another tab was funding.
- **`?pay=` link.** A testnet USDT address preselects USDT. A mainnet address on testnet is ignored.

Screenshots are in `docs/release/hire-tokens-screens/`. To reproduce: `scripts/rehearsal-page-quote.mts` writes the real quote, and `docs/release/hire-tokens-page.js` installs the stand-in wallet (part 1) and the quote transport (part 2).

### Rehearsal script (read-only, live testnet)

`scripts/usdt-rehearsal.mts` checks the following against a local flag-on server, sending, signing and approving nothing:

- the preference in the hint, and a USDT quote from the Evidence handler;
- the signature recovers to the registered wallet `0x9384…edda`;
- the hash covers the task, price, currency, expiry and escrow;
- the escrow accepts USDT;
- the purchase intent;
- the five calls, with calls 1 and 4 simulated against live testnet.

It stopped before any approval, signature or broadcast.

### Independent review

The complete diff was reviewed. Every finding was fixed and tested:

- **Blocker 1 — a job created but not yet budgeted locked the wallet forever.** It was read as a "mismatch", and mismatches were kept. Fixed: an OPEN job is unfunded whatever its budget, another hire's job is skipped by description, and a real mismatch is adopted as a job (see below). Tests: `hire-recovery` ("created but not yet budgeted", "another hire of the same agent", "settle never keeps a record forever").
- **Blocker 2 — anyone could lock any wallet through the unauthenticated attempts endpoint.** Fixed: an unverified record never blocks and is superseded by the next begin, and evidence is now this attempt's own create transaction after the record began. Prompt and expiry are validated. Tests: `hire-recovery` (evidence cases), `routes/hire-attempts` (supersede, verified holds, junk ignored).
- **The passkey path had no expiry when the dispute window could not be read.** Fixed: the hire stops before any prompt instead.
- **Second review (on `33afbaea`): a time-based fallback and a dropped mismatch.**
  - A 38-day ceiling had been added; it is **removed**. Nothing unlocks because time passed.
  - The only deadlines used are those encoded in the calls, decoded from the create transaction, or read from the job on chain, and a money-moving prompt is refused unless one is recorded.
  - A wrong-amount job is now adopted and its quote marked spent.
  - Tests: `hire-recovery` ("a record closes only on proof…", "a money-moving prompt is refused…", "a wrong-amount job is adopted…", "a funded attempt closed by its owner also spends its quote") and `hire-funding` ("time alone never proves anything").
- **Zero-address token** (plausible; checked on chain: legacy jobs on both chains report $U and a non-existent id reverts). Hardened anyway: a zero address is unread at every read site.
- **The server did not adopt a funded job.** Fixed: it indexes it.
- **Ownership loss could misreport "nothing sent".** Fixed: this is judged from the session's own sent hashes.
- **The passkey refusal named USDT for any token.** Fixed: it names the signed token.
- **The review screen could round a signed amount.** Fixed: the amount is printed from raw units.
- **Nits:** the backfill secret is compared in constant time, and the server hire path applies per-token limits. `totalFundedU` adding mainnet and testnet $U predates this release and is unchanged.

### Automated suites

These are all in `npm test`. The final counts are in the PR body.

- `tests/hire-tokens.test.mts`: registry, eligibility, preference, settlement hint, labels, rollback.
- `tests/hire-funding.test.mts`: two-tab race, simultaneous starts, stale reconciliation, abandonment, ownership loss, reload, receipt timeout, deadline recovery, payment-screen copy, path table.
- `tests/hire-recovery.test.mts`: replaced transactions, resume and its refusals, cross-device evidence and closing, per-token limits, backfill audit.
- `tests/currency-preference.test.mts`: the report, offered-only, and wiring at every entry point.
- `tests/discovery-tokens.test.mts`, `tests/workspace-tokens.test.mts`, `tests/requests-tokens.test.mts`: discovery, accounting and verifier, requests and proposals.
- Route tests: `usdt-job-store`, `hire-attempts` (one open attempt across devices, secret-only update and close), `requests-tokens` (store migrations).

**Not tested:**

- a funded hire from a real wallet in any non-$U token;
- atomic batches for other tokens;
- server relay execution in other tokens;
- WalletConnect phone wallets with other tokens;
- a real second device against the attempts endpoint;
- the production backfill.

## 9. Release validation

### Option A: staging app with its own testnet agent (the release-validation route)

Every hop is real: discovery, the live quote from the agent's **registered** endpoint, the wallet, funding, delivery, settlement, receipt and earnings. **Nothing below has been provisioned, deployed or registered.** Each step needs your approval, and the wallet actions are yours.

**What it is**

- **App.** A separate Fly app, `pokter-staging`, built from this branch with `fly.staging.toml`. The file is in the repository and is not used by any workflow; production deploys only from `fly.toml`. Settings:
  - testnet only (`NEXT_PUBLIC_ESCROW_CHAINS='97'`);
  - testnet USDT on (`NEXT_PUBLIC_HIRE_TOKENS='97:0x3376…4dDd'`);
  - no scheduled sweeps;
  - a 1GB volume of its own;
  - origin `https://pokter-staging.fly.dev`.
- **Agent.** A dedicated testnet agent: Touchstone, a Pokter house agent (token safety check, priced 0.05). It is run by the staging app with a **new key** and registered fresh on BNB Testnet. Its A2A endpoint is therefore the staging app's, written into its registration. It honours `preferred_currency`, signs its own quotes, delivers its own jobs, and is paid into its own new wallet. It is a different identity from production's Touchstone.

**Keys and secrets: all new, none from production**

| Secret | What it is | Source |
| --- | --- | --- |
| `HOUSE_AGENT_TOUCHSTONE_KEY` | The staging agent's wallet: it mints its identity, signs quotes, submits deliveries, and is paid | **new**, generated locally |
| `ALTANA_ADMIN_KEY` | Staging operator key: sponsorship, seals and team. Unused by a USDT browser-wallet hire, but read at start | **new**, generated locally, never funded |
| `SWEEP_SECRET`, `NOTIFICATION_UNSUBSCRIBE_SECRET`, `POKTER_DEMO_WRITE_SECRET` | Server secrets | **new** random values |
| `SCAN_BASE_URL`, `SCAN_API_KEY` | Registry index (read) | Needed for the hire page to read the agent. Not a signing key; use a separate key if the provider issues one, otherwise your decision |
| `BSC_RPC_URL`, `NODEREAL_API_KEY` | RPC (read and send) | Optional; public endpoints work. Not signing keys |
| `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN` | Notifications | **Leave unset**, so staging sends nothing real |

To generate a key without displaying it, this writes it to a file only you can read and prints only the address:

```bash
node -e "const{generatePrivateKey,privateKeyToAccount}=require('viem/accounts');const k=generatePrivateKey();require('fs').writeFileSync(process.argv[1],k,{mode:0o600});console.log(privateKeyToAccount(k).address)" ~/.pokter-staging-touchstone.key
```

Run it from the repository, once per key, with its own file name. Load the files with `fly secrets import` (stdin), never on a command line.

**Costs and the spending cap** (Fly pricing for iad, read on 26 October 2026 from docs.fly.io/about/pricing and docs.fly.io/about/billing)

- **There is no spending cap.** Fly documents no spending cap or budget alert. Billing is monthly per organisation, and prepaid credits (minimum $25) are offered to accounts without a card. The figures below are an **estimate** from the published prices for what this plan creates. Spend is limited in practice only by creating nothing else and removing everything on a fixed date.
- **What is created, and its estimated cost:**

  | Resource | Price | Estimate for this rehearsal |
  | --- | --- | --- |
  | One machine, `shared-cpu-1x`, 2GB | $6.70 for 1GB + $6.00 for the second GB = $12.70 a month if always on; billed only while running (it stops when idle) | about $12.70 a month if left running; a few days' rehearsal should cost well under that |
  | One volume, 1GB, created with **automatic snapshots off** | $0.15 a month | $0.15 a month |
  | Volume snapshots | Billed by storage; the first 10GB a month are free | **none created**: `--scheduled-snapshots=false`. With the default, daily snapshots are kept 5 days and outlive the volume |
  | IP addresses | Shared IPv4 and IPv6 are free | **no dedicated IPv4** is allocated ($2 a month if it were) |
  | Certificates | The first 10 are free | none beyond the `fly.dev` default |
  | Testnet tBNB and test USDT | faucets | $0 |

- **Estimate if forgotten for a whole month: about $12.85** (machine and volume). This is a quote from published prices, **not a guaranteed limit**. Anything created beyond this plan, or price changes, would add to it. The rehearsal plan removes everything the same week.
- **Mainnet rehearsal** (later, separately approved): real gas for about six transactions per hire, plus the signed amount (at most 5 units of the token per job).

**Cleanup, verified resource by resource.** Fly's docs do not promise that destroying an app removes volumes or snapshots, so each is removed and checked:

1. `fly volumes list -a pokter-staging`, then `fly volumes destroy <id>` for each volume.
2. `fly volumes snapshots list <id>` for each volume. With automatic snapshots off this is empty; delete any that exist. Snapshots outlive their volume until retention ends.
3. `fly ips list -a pokter-staging`: release any dedicated IPv4 with `fly ips release <ip>`. Shared addresses cost nothing.
4. `fly certs list -a pokter-staging`: remove any custom certificate.
5. `fly apps destroy pokter-staging`.
6. Confirm `fly apps list` no longer shows it, and the organisation's billing page shows no `pokter-staging` usage on the next day.
7. **Off chain, nothing else is billed.** The staging agent's on-chain registration stays on BNB Testnet; it costs nothing to leave.

**Wallet actions before provisioning (yours)**

1. Generate the three keys above. They are not transactions.
2. **One testnet transfer, from your wallet (one wallet prompt):** send 0.005 tBNB to the new Touchstone address. It pays the gas for the two registry transactions below and the agent's delivery submissions.
3. Prepare the buyer wallet with about 0.01 tBNB and at least 0.15 test USDT (three 0.05 hires), from the BNB Chain testnet faucet. Confirm the faucet's USDT is `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd`; any other address is a different token and will be refused.
4. WalletConnect is optional: add `pokter-staging.fly.dev` to the project's allowed origins only if you want to test a phone wallet.

**Provisioning commands** (prepared, not run; each needs your go-ahead)

```bash
fly apps create pokter-staging
```

```bash
fly volumes create pokter_staging_data --app pokter-staging --region iad --size 1 --scheduled-snapshots=false
```

```bash
fly secrets import --app pokter-staging < ~/.pokter-staging.env
```

```bash
fly deploy --config fly.staging.toml --app pokter-staging
```

```bash
FLY_APP=pokter-staging node scripts/house-register.mjs touchstone 97
```

**The registry transactions** (part of the setup, and needing your go-ahead like the rest). The last command makes the staging server send **two transactions on BNB Testnet**, to the ERC-8004 identity registry `0x8004A818BFB912233c491871b3d84c89A494BD9e`:

1. `register(agentURI)`: mints the agent's identity. Its owner and wallet are the new Touchstone key.
2. `setAgentURI(agentId, uri)`: publishes the completed registration file, with the staging endpoint and the new id.

**Both are signed by the new staging agent key**, which runs on the staging server and pays gas from the 0.005 tBNB you sent. **There is no prompt in your wallet for them.** This is how every Pokter house agent is registered: the agent owns its identity, signs its own quotes, and is paid into its own wallet.

The staging identity is disposable: a test agent owned by its own staging key is what this rehearsal needs, and ownership stays with that key.

After the transactions, wait until `https://pokter-staging.fly.dev/agents/97/<new id>` shows the agent: the registry index needs to catch up.

**The rehearsal: real quote → wallet → funding → delivery → settlement → receipt and earnings**

Use your browser wallet. All approvals and funding are yours. After each stage, run the read-only check below. It compares the escrow's own state with what was signed and with what Pokter shows.

```bash
ORIGIN=https://pokter-staging.fly.dev npx tsx scripts/rehearsal-verify.mts --chain 97 --job <id> --currency 0x337610d27c682E347C9cD60BD4b3b107C9d34dDd --amount <signed raw> --buyer <your address> --provider <Touchstone address> --status <FUNDED|SUBMITTED|COMPLETED>
```

1. **Hire A, the clean path.** Open `/hire/97/<id>?pay=0x337610d27c682E347C9cD60BD4b3b107C9d34dDd` and use a token brief from Touchstone's card.
   - **Check:** the review says it signed 0.05 USDT and the preference was honoured.
   - **Five wallet prompts:** create, register, set budget, **approve exactly the signed amount**, fund.
   - The success screen shows the job id. Run the verifier with `--status FUNDED`, which checks job id, token, raw amount, parties, deadline and no leftover allowance.
2. **Delivery.** Touchstone submits on its own. Run the verifier with `--status SUBMITTED`, then open the job page and the deliverable.
3. **Settlement.** After the review window (about 15 minutes on testnet), release from your job page in the workspace ("Release … to Touchstone"). That is **one wallet prompt**.
   - Then force one status refresh: `curl -X POST "https://pokter-staging.fly.dev/api/sweep?force=1" -H "authorization: Bearer $SWEEP_SECRET"`.
   - Run the verifier with `--status COMPLETED`. It also checks the receipt.
   - Earnings, without the agent's key: check that `/api/v1/activity` shows the job in `valueByToken` under testnet USDT, and that `/proof` lists it in USDT, "never added to $U". The provider's own `/build` earnings line needs the agent wallet to sign in, so on staging it is read through the agent page instead.
4. **Hire B, interruption recovery.** Start a second hire, and **reject the approval prompt**.
   - Reload: the page says an earlier attempt is being checked.
   - Use **Finish funding job N**: two prompts, approve and fund, on **the same job id** (no second job).
   - Verify with `--status FUNDED`.
   - While it is pending, open a second tab: it must refuse to start another hire.
5. **Hire C, the passkey and cross-device check.** Connect a passkey: it must be refused for the USDT price, by name. Then, with a hire left pending on one device, open the hire page on another browser with the same wallet: it must be blocked once the first device's create transaction is on chain.

**Pass:** every verifier run passes, and no stage needed a second payment or showed $U for a USDT job. Any failure is reported with the verifier output and the job id.

### Option B: local branch with intercepted quote delivery (supplementary integration test only)

This is **not an end-to-end pass.**
- It runs this branch locally (`pokter2-usdt-rehearsal`).
- The quote is real, signed by the local Evidence handler with the agent's registered key, but its delivery into the hire page is **intercepted**: part 2 of `docs/release/hire-tokens-page.js`, with a quote from `scripts/rehearsal-page-quote.mts`.
- Escrow, token, approvals and funding would be real. Discovery and the live quote hop are not tested.
- Use it only to repeat the payment path quickly. It does not count toward staging validation.

## 10. Blockers, consolidated

| # | Blocker | Blocks |
| --- | --- | --- |
| 1 | Your approval to provision option A (app, volume, secrets, deploy), and the house-agent registration | staging-validated |
| 2 | Wallet actions for option A: generate keys, 0.005 tBNB to the staging agent, buyer test USDT and tBNB, then the rehearsal's approvals, funding and release | staging-validated |
| 3 | The option A rehearsal passing every verifier run, including the recovery and cross-device steps | staging-validated |
| 4 | Mainnet rehearsal with real funds, per token to enable (USDT, USDC, USD1) | production-enabled for that token |
| 5 | Production currency backfill: dry run, write run, audit review (section 6) | production-enabled (published $U figures count only identified jobs until it runs) |
| 6 | Binance-Peg USDT and Binance-Peg USDC are **proposed**: verified, named as such everywhere they are chosen or confirmed, and off. Each is enabled only after its own real-wallet rehearsal on mainnet passes (blocker 4) | production-enabled for each |
| 7 | Publish the receipt-verifier migration note (section 11) with the release | release |
| 8 | Atomic batch for other tokens: off, not tested | nothing (falls back); a later enhancement |
| 9 | Agents outside Pokter must implement `preferred_currency` themselves; until then they sign in their own currency and the buyer is told | nothing (by design) |

Nothing in this release adds card payments, new swaps or x402 changes.

## 11. Migration note: receipt verifier output

For anyone consuming the receipt verifier's summary (`/api/v1/receipts/verifier` and `src/lib/proof/verifier.ts`):

- **Removed:** `byChain[].completedValueRaw`. It added together the raw budgets of every completed job on a chain, whatever its token, which is wrong as soon as a chain has two tokens.
- **Added:**
  - `byChain[].completedByToken`: one entry per token on that chain, `{ chainId, token, completed, completedValueRaw }`;
  - a top-level `completedByToken`: the same entries across both chains.
- **Token values:**
  - `token` is the address the escrow reports through `jobPaymentToken`;
  - `null` means unread, never $U;
  - `completedValueRaw` is in that token's own base units.
- **To migrate:** read `byChain[].completedByToken`. For the old $U-only figure, take the entry whose `token` is that chain's $U (`0xcE24…6666` on 56, `0xc70B…5565` on 97). Never sum entries with different tokens.
- **New check:** receipts that name a token are now also checked against the escrow (`paymentToken`). A receipt naming the wrong token fails verification.
- **Unchanged:** `verified`, `completed`, `outsideTeam`, `team`, `indexed` and `mismatched`.
