# Production release and owner-led test session

Prepared on 26 October 2026 for PR #322. Nothing here has been deployed, enabled or funded.

## What restricts new currencies to you

**Nothing does, and that is accepted for this test.** Pokter has no existing server-enforced way to offer a currency to one wallet only:
- `NEXT_PUBLIC_HIRE_TOKENS` is compiled into the public bundle;
- the builder sign-in proves a wallet but gates nothing on the hire path.

Building such a gate would be new work. While the currencies are on, **anyone** can hire in them through Pokter, for the length of the test.

## Release sequence

1. **GitGuardian.** You confirm in the dashboard that the matched value for incident 39048303 is the public testnet USDT address, then mark it a false positive. (Alternatively, approve squashing the branch so no commit contains that line.)
2. **Merge #322 with currencies off.** The deploy workflow runs its production checks. Then:

   ```bash
   node scripts/release-smoke.mjs https://pokter.xyz
   ```

   It is read-only. It mirrors the deploy checks, plus the new MCP fields, per-token activity and the kit's token list.
3. **Backfill**, which is a production write and needs your go-ahead:
   - Run `node scripts/currency-backfill.mjs` as a dry run and read the report.
   - Then run `node scripts/currency-backfill.mjs --write release-2026-10-26`.
   - Then dry-run once more. Whatever remains is unreadable and stays unknown; the audit says why.
4. **Turn the test currencies on.** This is a one-line `fly.toml` change, merged and deployed:

   ```toml
   NEXT_PUBLIC_HIRE_TOKENS = '56:0x55d398326f99059fF775485246999027B3197955,56:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d,56:0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d'
   ```

   Then run the smoke script again.
5. **Pre-flight, right before you pay:**

   ```bash
   node scripts/test-session-preflight.mjs
   ```

   It asks production for fresh signed quotes: Touchstone in each currency (`get_quote` with `preferred_currency`), and IVL Rebalancer for USDT. Each line reads READY only if the quote is in that token, for the expected raw amount, signed by the agent's registered wallet, and fundable. Anything else reads **PENDING (do not pay)** and is skipped. No agent is assumed to support a token from its listing.

   Run today against production, before the release, it rightly reported $U as READY and the rest as PENDING. Touchstone signed $U for every currency, and IVL's USDT was not fundable.
6. **The session** (below).
7. **After it:** keep only the currencies whose checks passed. Remove any that failed from `fly.toml` and redeploy. Existing jobs keep their token, labels, settlement and "Finish funding" recovery, none of which reads the flag.

## Facts that shape the session

- **The review window on the mainnet escrow is 7 days** (604,800 s, read from the policy contract `0x9C01…6dE5`). Release, settlement, earnings and "settled" receipts **cannot happen during the session**, and nothing will shorten them. A job's deadline is 24 hours to deliver plus 7 days.
- **Who signs in which currency today:**
  - Of 172 agents in Pokter's pool, 37 have a signed price.
  - **19** are in mainnet $U, **17** in testnet $U, and **1** in Binance-Peg USDT (IVL Rebalancer).
  - **None** signs in USDC or USD1.
  - Pokter's own Touchstone signs in whichever enabled currency it is asked for. That was verified on the release build with all four currencies (0.05 in each token's own units, bound to the mainnet escrow); it must be re-verified on production in step 5.
- **Gas:**
  - Creating a job costs about **1.33M gas**, measured by estimate on mainnet. A whole hire is about 1.8M gas.
  - At today's 0.05 gwei that is about 0.0001 BNB per hire.
  - **Hold at least 0.005 BNB** for the session.
  - Touchstone's own wallet holds about 0.0004 BNB for its delivery submissions, enough at today's price. Top it up if gas rises above about 1 gwei.
- **Prompts per hire:**
  - A non-$U hire takes **5 wallet prompts**: create, register, set budget, approve exactly the price, fund. Such hires are never batched.
  - A $U hire may be one batch if your wallet supports it.
  - On first connect, the wallet is switched to testnet and then asked back to BNB Chain. That is pre-existing behaviour, approve both.
  - Touchstone needs **"I understand, and want to hire anyway"** ticked on review, because its one attestation cannot be decoded. That is also pre-existing.

## Test list

**Brief**, to paste (it is also pre-filled by every Touchstone link):

```text
Check the BNB Chain token 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82 before a buy: is it safe to trade, and why.
```

The links:

1. **$U.** https://pokter.xyz/hire/56/374115?task=Check%20the%20BNB%20Chain%20token%200x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82%20before%20a%20buy%3A%20is%20it%20safe%20to%20trade%2C%20and%20why.
2. **Binance-Peg USDT.** https://pokter.xyz/hire/56/374115?task=Check%20the%20BNB%20Chain%20token%200x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82%20before%20a%20buy%3A%20is%20it%20safe%20to%20trade%2C%20and%20why.&pay=0x55d398326f99059fF775485246999027B3197955
3. **Binance-Peg USDC.** https://pokter.xyz/hire/56/374115?task=Check%20the%20BNB%20Chain%20token%200x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82%20before%20a%20buy%3A%20is%20it%20safe%20to%20trade%2C%20and%20why.&pay=0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
4. **USD1.** https://pokter.xyz/hire/56/374115?task=Check%20the%20BNB%20Chain%20token%200x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82%20before%20a%20buy%3A%20is%20it%20safe%20to%20trade%2C%20and%20why.&pay=0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d
5. **Optional, an outside agent signing USDT natively.** IVL Rebalancer, https://pokter.xyz/hire/56/341628. Its brief is `BNB-USDT <your wallet address>`, the format its card publishes.

All of these are on BNB Chain mainnet, with real funds.

| # | Currency | Agent | Expected price (raw) | Your wallet needs | Expected result during the session |
| --- | --- | --- | --- | --- | --- |
| 1 | $U | Touchstone 56/374115 (delivered paid jobs before, Reliable) | 0.05 $U (50000000000000000) | ≥ 0.05 $U, or enough BNB for the shortfall swap (one extra prompt) | FUNDED in $U; delivered (SUBMITTED) within minutes; job page and receipt in $U |
| 2 | Binance-Peg USDT | Touchstone, asked for USDT | 0.05 Binance-Peg USDT (50000000000000000) | ≥ 0.05 USDT | Review names "Binance-Peg USDT" with chain and contract; FUNDED with `jobPaymentToken` = USDT; delivered; receipt in USDT, never $U |
| 3 | Binance-Peg USDC | Touchstone, asked for USDC | 0.05 Binance-Peg USDC (50000000000000000; 18 decimals) | ≥ 0.05 USDC | As in 2, in USDC. **Also the recovery check** (below) |
| 4 | USD1 | Touchstone, asked for USD1 | 0.05 USD1 (50000000000000000) | ≥ 0.05 USD1 | As in 2, in USD1 |
| 5 (optional) | Binance-Peg USDT | IVL Rebalancer 56/341628, an outside agent (signs USDT natively; never delivered a paid job) | 1 Binance-Peg USDT (verified today: raw 1e18, signer `0x6D19…b703`) | ≥ 1 USDT | FUNDED in USDT. **Delivery is unproven**: if none arrives within 24 hours, the 1 USDT is reclaimable 8 days after funding |

The whole session spends 0.05 each of $U, USDT, USDC and USD1, plus 1 USDT if you include #5, plus well under 0.001 BNB in gas.

**Recovery, during hire 3:**
1. **Approve the first four prompts** (create, register, set budget, approve), then **reject the fifth, the fund prompt.** The job now exists and holds nothing. The page keeps the attempt pending, because a fund request is the one that could still pay, and offers **"Finish funding job N"**.
2. **Reload.** The attempt is picked up, and nothing new can be funded meanwhile.
3. **While it is pending, open a second tab.** That tab refuses to start another hire.
4. **Click "Finish funding job N".** Only the fund prompt is asked, because the exact approval is already in place, and it funds the **same job id**. No second job is created.
5. **Connect a passkey on a token hire.** It is refused, naming the token.

Rejecting an earlier prompt (create, register, budget or approve) closes the attempt instead, since nothing could pay. The page then says nothing was taken. A job that was created stays empty, and the next try creates a new one.

## What I check, and what stays pending

For each funded job, I run this read-only check against production, at FUNDED and again at SUBMITTED:

```bash
ORIGIN=https://pokter.xyz npx tsx scripts/rehearsal-verify.mts --chain 56 --job <id> --currency <token> --amount 50000000000000000 --buyer <you> --provider 0x071044a5A92F6C90cf9D08D5059921da734D19e7 --status <FUNDED|SUBMITTED>
```

It confirms against the escrow itself:
- the job id;
- the client, provider and status;
- `jobPaymentToken`, which must equal the token you chose;
- the budget, which must equal the signed raw amount exactly;
- the deadline;
- that no allowance is left.

It also checks that Pokter's job route and receipt agree. Separately, I check the quote on your review screen, the delivery content, and the recovery steps above.

| Check | During the session | Pending |
| --- | --- | --- |
| Quote in the chosen currency, exact amount | ✔ | |
| Funding, token and amount on chain | ✔ | |
| Delivery (Touchstone) | ✔ normally within minutes | IVL: up to 24 h |
| Receipt names the token and raw amount | ✔ (unsettled) | |
| Recovery: same job, no repayment | ✔ (hire 3) | |
| Release, settlement, earnings, "settled" receipt | | **7 days after delivery** |
| Dispute or refund paths | | Only if you choose to dispute inside the window |
| Reclaim for no delivery | | 8 days after funding |

**Pass, per currency:** the quote is in that currency and named correctly, the funded job matches it on chain, the delivery arrives, the receipt is right, and nothing is labelled $U. **Fail:** that currency is removed from `fly.toml` and redeployed, so no new hires use it. Funded jobs, their delivery, settlement and recovery are unaffected.

## Rollback

- **Preferred: turn the currency off.** Remove it from `NEXT_PUBLIC_HIRE_TOKENS` and redeploy, keeping this code. Nothing is relabelled.
- **Last resort: revert the code.** It was tested across versions: main runs on the migrated databases, but it would show every job as $U and clear a job's recorded token whenever it rewrites the row. After re-releasing, run the backfill again; cleared tokens come back as unknown, never as $U, until it does.
