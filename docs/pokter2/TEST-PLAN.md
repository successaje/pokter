# Manual test plan: money paths on BNB testnet

These paths were not run on chain during the rebuild. Each step lists what
should happen. Anything else is a bug: note the job number and the step.

**Setup**

- Run `npx next dev --port 4313` in `~/Documents/github/pokter2`, or use the
  `pokter2` preview.
- Use two wallets: a **passkey** wallet (create one from Connect) and a
  **browser wallet** (MetaMask/Rabby on BSC testnet).
- Fund each with test $U and tBNB from `@bnbchain_official_bot`. Wallet →
  "Get test $U" shows the exact sentence to send.
- A dependable agent to hire: **#2554 Venus Yield Keeper** (testnet; it
  quotes 0.10 $U and signs bound terms). The courier path: any mainnet agent
  marked "Delivered through Pokter's testnet courier".

## 1. Hire with a browser wallet

| # | Do | Expect |
|---|---|---|
| 1.1 | `/agents/97/2554` → **Try it free first** → Ask for a signed answer | "It would take this task", a quote of 0.10 $U, and "Its registered wallet … signed exactly these terms" |
| 1.2 | **Hire Venus Yield Keeper** | `/hire/97/2554`. Step 1 shows templates. No wallet prompt yet |
| 1.3 | Review terms → set the budget to 0.05 | The budget error names the signed price (0.10); Continue is disabled |
| 1.4 | Set the budget to 0.10 → Continue to payment | The payment step asks you to connect. No wallet was requested before this point |
| 1.5 | Connect → Browser wallet, on the wrong network | The sheet stays open with "Switch to BNB Testnet" |
| 1.6 | Tick the confirmation, then go Back, change the task and return | The confirmation box is **unticked** again |
| 1.7 | Confirm → **Fund escrow · 0.1 $U** | The progress list moves from signed quote through creating, registering, budgeting, approving and funding to confirming. The wallet asks for each, or for one batch |
| 1.8 | Reject one wallet prompt mid-way | "You declined in the wallet. Nothing was sent…". The retry is the Fund button again, behind the same confirmation |
| 1.9 | Complete the hire | "Job #N is funded", then the delivery request shows accepted. "Follow this job" goes to `/workspace/jobs/N` |
| 1.10 | Optional: Revoke approval | One transaction, then the notice disappears |

## 2. Follow, verify, release, review

| # | Do | Expect |
|---|---|---|
| 2.1 | Stay on `/workspace/jobs/N` | "In progress" with a deadline countdown. It moves to "Delivered · review it" within minutes, without a refresh (30 s polling) |
| 2.2 | Check that **Release payment** is disabled | Disabled until both Verify and Open the file are done |
| 2.3 | Verify → Open the file | "Matches"; the file opens in a new tab |
| 2.4 | Release payment | Wallet transaction; the phase becomes **Settled**; the timeline's last step is complete. Under the optimistic policy, if the dispute window is still open you see "The dispute window is still open…" and nothing moves |
| 2.5 | Review this job → Sign and publish | A signature only, no gas. "Review published". It appears under Work and reviews on `/agents/97/2554` |
| 2.6 | `/workspace`, `/workspace/jobs`, `/workspace/wallet` | The job appears with consistent status and amounts. Wallet → Job payments shows "Released to agents" |

## 3. Hire with a passkey wallet (sponsored gas)

| # | Do | Expect |
|---|---|---|
| 3.1 | Disconnect the browser wallet. Connect → Passkey → Create | Wallet created; the account menu shows the address and balances |
| 3.2 | Hold at least 0.1 $U and 0 tBNB, then hire #2554 | The network fee row reads "Covered by Pokter…". The progress list includes "Covering the network fee". One passkey prompt for the hire |
| 3.3 | Hold 0 $U but enough tBNB, then hire | "Swapping BNB for $U" (an extra confirmation), then the hire |
| 3.4 | Hold 0 $U and 0 tBNB | The fee row does **not** promise coverage. The hire fails with a clear "not enough in the wallet" message |
| 3.5 | Account → Forget on this device → Connect → I already have one | The same address is restored |

## 4. Not delivered → reclaim

| # | Do | Expect |
|---|---|---|
| 4.1 | Hire a mainnet agent through the courier path (warning shown before funding) | Funded |
| 4.2 | If nothing arrives, open the job after its 24 h deadline | "Not delivered · reclaim", listed in Workspace → Needs you |
| 4.3 | Reclaim | The full budget returns to the funding wallet; the phase is Refunded |

## 5. Recovery and other devices

| # | Do | Expect |
|---|---|---|
| 5.1 | In a private window, connect the same browser wallet → Workspace → "Recover a job by its number" | The job is rebuilt from chain and opens |
| 5.2 | Recover a job funded by a **different** wallet | "…was funded by a different wallet". The job is not added |
| 5.3 | Open `/workspace/jobs/1352` with no wallet | A read-only settled job with its timeline |

## 6. Builder Studio

| # | Do | Expect |
|---|---|---|
| 6.1 | `/studio/new?template=health-factor-monitor` → Configure with a real https A2A endpoint → Test → Run the check | The answer is shown, with the latency, skills found and a safety list |
| 6.2 | Publish on BNB testnet with a browser wallet | Two transactions, with progress through registering, confirming, publishing the profile and verifying. "registered" with the new ID |
| 6.3 | Reject the second transaction, then come back to the same draft | "This draft's registration was interrupted"; "Resume registration" finishes without minting again |
| 6.4 | `/studio/import` with the new ID → Verify ownership | One signature, then the agent's manage page |
| 6.5 | Manage → Public profile: change the description → Save to chain | One transaction; "Profile updated on chain". Other tags are kept |
| 6.6 | Fund a job for your own agent from another wallet, then Customer jobs → Deliver by hand | Sign → stored → submit transaction → "Delivered". If the index confirm fails, the button becomes "Confirm delivery" and never resubmits |
| 6.7 | Publish with a passkey wallet | Succeeds. The success screen says Studio cannot manage passkey-owned agents yet |

## 7. Phone (375 px)

Repeat 1.2 to 1.9 and 2.1 to 2.4 on a phone. The hire bar should sit above
the tab bar, the connect sheet should open from the bottom, and no page
should scroll sideways.
