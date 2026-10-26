# Production release and owner-led test session

Prepared on 26 October 2026 for PR #322. Nothing here has been deployed, enabled or funded.

## What restricts new currencies to you

**Nothing does.** Pokter has no server-enforced way to offer a currency to one wallet:
- `NEXT_PUBLIC_HIRE_TOKENS` is compiled into the public bundle;
- the builder sign-in proves a wallet but gates nothing on the hire path.

Enabling **one currency at a time** limits exposure. It does not make the test private: while a currency is on, anyone can hire in it.

## What has and has not been tested

- **Before this session**, the release was checked on a local production build against real mainnet agents, with a stand-in wallet that **cannot sign**. Those checks reach the wallet prompt and prove what happens up to it, and on a rejection.
- **They are not a payment end-to-end test.** No transaction was signed, mined or funded. That is what your live wallet session tests.

## Sequence

1. **GitGuardian.** In the dashboard, reveal the matched value of incident 39048303 and confirm it is exactly `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd` (the public testnet USDT contract), in `docs/release/hire-tokens.md`, commit `dbcbfcf2`. Then close it as Ignored, false positive. If it is anything else, stop: treat it as a real secret. Squashing commits is not a substitute: it neither confirms the value nor closes the incident.
2. **Merge #322 with all new currencies off.** This also ships the fix for the $U top-up swap ("chain 0"), which is broken on main today. Then:

   ```bash
   node scripts/release-smoke.mjs https://pokter.xyz
   ```

3. **Back up** the four databases this release changes (jobs, briefs, provider, campaign):

   ```bash
   node scripts/backup-databases.mjs pre-backfill-2026-10-26
   ```

   The script checks free space, copies online, verifies `integrity_check` and the row counts, and refuses a reused label. Then keep a copy off the machine:

   ```bash
   fly sftp get -a pokter /data/backups/pre-backfill-2026-10-26/jobs.db ./jobs-pre-backfill.db
   ```

4. **Backfill.**
   - Dry run first, and inspect the result: rows examined, read and unread, the tokens found, and the unread reasons.

     ```bash
     node scripts/currency-backfill.mjs
     ```

   - Then the write. It records one audit row per job (`written`, `already-set` or `unread`, with the reason):

     ```bash
     node scripts/currency-backfill.mjs --write release-2026-10-26
     ```

   - Then verify. Run the dry run again: what remains is unreadable and stays unknown. Read the audit rows for `release-2026-10-26`. Compare the proof page's $U figures with those before; they may only grow.
5. **Optional: a $U hire** before any new currency is on (session step A below). It checks that the release kept the default path intact.
6. **Enable Binance-Peg USDT only.** Merge the local branch `release/enable-usdt` (one pair in `fly.toml`), then run the smoke script again, then do session step B.
7. **Only if USDT passed, enable Binance-Peg USDC** (`release/enable-usdc`, which adds one pair), then step C.
8. **Only if USDC passed, enable USD1** (`release/enable-usd1`), then step D.
9. **Any currency that fails is removed from `fly.toml` and redeployed.** New hires in it stop. Its funded jobs keep their token, settlement and "Finish funding" recovery, none of which reads the flag.

## Facts that shape the session

- **The review window on the mainnet escrow is 7 days** (604,800 s, read from the policy contract). Release, settlement, earnings and "settled" receipts **cannot happen during the session**, and nothing shortens them. A job's deadline is 24 hours to deliver plus 7 days.
- **The agent.** Touchstone (56/374115), a Pokter house agent. It has delivered paid mainnet jobs before and is rated Reliable. Today it signs 0.05 $U (verified). The release lets it sign in whichever enabled currency it is asked for, which was verified locally for all four with the release's own handler and is **re-verified on production before each payment**:

  ```bash
  node scripts/test-session-preflight.mjs <$U|USDT|USDC|USD1>
  ```

  Pay only on **READY**. The script fetches a fresh signed quote and checks the token, the exact amount, the registered signer, and that the quote can be funded.
- **Gas:**
  - Creating a job costs about 1.33M gas (estimated on mainnet); a whole hire is about 1.8M gas, about 0.0001 BNB at 0.05 gwei.
  - Hold **at least 0.005 BNB**.
  - Touchstone's own wallet holds about 0.0004 BNB for delivery submissions. That is enough at today's price; top it up if gas rises above about 1 gwei.
- **Prompts:**
  - A new-currency hire takes **5 prompts**: create, register, set budget, approve exactly the price, fund.
  - On first connect, the wallet is switched to testnet and then asked back to BNB Chain (pre-existing behaviour).
  - Touchstone needs **"I understand, and want to hire anyway"** ticked on review (pre-existing).
- **The IVL Rebalancer hire is dropped** from this test. Touchstone covers the payment path, and IVL would add an unproven delivery.

## Session steps

**Brief**, to paste (it is also pre-filled by every link):

```text
Check the BNB Chain token 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82 before a buy: is it safe to trade, and why.
```

Every step costs **0.05** of its currency (raw 50000000000000000; each of these tokens has 18 decimals). The links:

- **A ($U, optional, before any new currency):** https://pokter.xyz/hire/56/374115?task=Check%20the%20BNB%20Chain%20token%200x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82%20before%20a%20buy%3A%20is%20it%20safe%20to%20trade%2C%20and%20why.
- **B (Binance-Peg USDT):** https://pokter.xyz/hire/56/374115?task=Check%20the%20BNB%20Chain%20token%200x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82%20before%20a%20buy%3A%20is%20it%20safe%20to%20trade%2C%20and%20why.&pay=0x55d398326f99059fF775485246999027B3197955
- **C (Binance-Peg USDC):** https://pokter.xyz/hire/56/374115?task=Check%20the%20BNB%20Chain%20token%200x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82%20before%20a%20buy%3A%20is%20it%20safe%20to%20trade%2C%20and%20why.&pay=0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
- **D (USD1):** https://pokter.xyz/hire/56/374115?task=Check%20the%20BNB%20Chain%20token%200x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82%20before%20a%20buy%3A%20is%20it%20safe%20to%20trade%2C%20and%20why.&pay=0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d

| Step | Currency | Your wallet needs | Expected result |
| --- | --- | --- | --- |
| A (optional) | $U | ≥ 0.05 $U, or enough BNB for the top-up swap (one extra prompt) | FUNDED in $U; delivered within minutes; job page and receipt in $U |
| B | Binance-Peg USDT | ≥ 0.05 USDT | Review names "Binance-Peg USDT" with chain and contract; FUNDED with `jobPaymentToken` = USDT; delivered; receipt in USDT, never $U |
| C | Binance-Peg USDC | ≥ 0.05 USDC | As in B, in Binance-Peg USDC |
| D | USD1 | ≥ 0.05 USD1 | As in B, in USD1 |

**Each new-currency step (B, C, D) has two parts.**

1. **A hire that runs to delivery.** Approve all five prompts, then wait for the delivery and read the answer (Safe, Caution or Avoid, with its reasons).
2. **Reload and recovery, on a second 0.05 hire in the same currency:**
   1. Approve create, register, set budget and approve. **Reject the fund prompt.** The job exists and holds nothing. The page keeps the attempt pending, because a fund request is the one that could still pay, and offers **"Finish funding job N"**.
   2. **Reload.** The attempt is picked up, and nothing new can be funded.
   3. **Open a second tab.** It refuses to start another hire.
   4. **Click "Finish funding job N".** Only the fund prompt is asked (the exact approval is in place), and it funds the **same job id**. No second job is created. Its delivery follows.
   5. **On step B only, connect a passkey.** It is refused for the token hire, by name.

So each new currency costs 0.10 (two hires), and with the optional $U hire the session spends 0.10 each of USDT, USDC and USD1 plus 0.05 $U, plus well under 0.001 BNB in gas.

## What I check, and what stays pending

For every funded job, I run this read-only check against production, at FUNDED and again at SUBMITTED:

```bash
ORIGIN=https://pokter.xyz npx tsx scripts/rehearsal-verify.mts --chain 56 --job <id> --currency <token> --amount 50000000000000000 --buyer <you> --provider 0x071044a5A92F6C90cf9D08D5059921da734D19e7 --status <FUNDED|SUBMITTED>
```

It confirms against the escrow itself:
- the job id;
- the client and provider;
- the status;
- `jobPaymentToken`, which must equal the token you chose;
- the budget, which must equal the signed raw amount exactly;
- the deadline;
- that no allowance is left.

It also checks that Pokter's job page and receipt say the same. I read the delivered answer, and for the recovery hire I check that the funded job id is the one that was created before the rejection.

| Check | During the session | Pending |
| --- | --- | --- |
| Quote in the chosen currency, exact amount (pre-flight and review) | ✔ | |
| Funding, token and amount on chain | ✔ | |
| Delivery and its answer | ✔ normally within minutes | |
| Receipt names the token and raw amount | ✔ (unsettled) | |
| Reload, second tab, Finish funding the same job | ✔ | |
| Release, settlement, earnings, "settled" receipt | | **7 days after each delivery** |
| Dispute or refund paths | | only if you choose to dispute inside the window |

**Pass, per currency:**
- the pre-flight read READY;
- the review named the currency correctly;
- both funded jobs match on chain;
- the answer was delivered;
- the receipt is right;
- recovery funded the same job;
- nothing was labelled $U.

Then, and only then, the next currency is enabled. **Fail:** that currency is removed and redeployed, and the next one is not enabled.

## Rollback and recovery

- **The rollback is to turn a currency off,** keeping this token-aware code. Old main is **not** a routine rollback: it has no notion of currency, shows every job as $U, and clears a job's recorded token whenever it rewrites the row.
- **For a genuine failure in the release code,** fix forward on the token-aware code and redeploy, with the new currencies off.
- **If old code must run temporarily**, take a fresh backup first.
  - After re-releasing, run the backfill again: each job's token is read back from the escrow (`jobPaymentToken`), which is authoritative, so cleared records are recoverable.
  - Restoring a backup over a live file is a last resort: stop the app first, because jobs indexed after the backup would be lost.
