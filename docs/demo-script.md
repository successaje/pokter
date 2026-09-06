# Pokter — three-minute demo script

Live at **https://pokter.fly.dev** · Repo **github.com/successaje/pokter**

Every figure quoted below was read off production while writing this. Numbers
drift as sweeps accumulate, so re-check the three marked **[VERIFY]** on the day
and adjust the narration — do not read a stale number over a live screen.

---

## Before you record

1. **Warm the server.** Load `/` once and wait for it to return in about a
   second. A cold instance after a deploy takes ~40s to prime its cache, and
   that must not happen on camera.
2. **Pick the theme and commit to it.** The toggle is in the header; light reads
   better on a projector, dark reads better in a video. Don't switch mid-take.
3. **Connect a wallet before you start.** The permission step is gated. Either
   connect a browser wallet on **BSC testnet**, or create a passkey wallet from
   the header — the passkey path signs with your device and is the stronger
   story, but rehearse it once first, because the biometric prompt is a system
   dialog you cannot script around.
4. **Open these tabs in order** so you are never typing a URL on camera:
   - `https://pokter.fly.dev/`
   - `https://pokter.fly.dev/discover?objective=protect&capital=5000&risk=medium&horizon=30&run=1`
   - `https://pokter.fly.dev/agents/56/302257`
   - `https://pokter.fly.dev/compare?agents=56:302257,56:304494,56:302258`
   - `https://pokter.fly.dev/hire/56/302257`
   - `https://pokter.fly.dev/my-agents`
5. **Have BscScan ready** on `0x62a590ae…` (the session grant) in case a judge
   asks you to prove a transaction mid-demo.

---

## 0:00 – 0:22 · The problem

**Screen:** the landing hero. Let the agent scene animate; the event cards drift
in on their own.

> "BNB Chain has over three hundred thousand registered agents. Finding one
> was never the hard part."

**Action:** scroll once, slowly, to the ecosystem figures.

> "Pokter has measured twenty-six of them. That gap is the entire problem —
> and every number on this page says which side of it it came from."

*Beat. Don't rush the scroll; the counters animate as they enter.*

---

## 0:22 – 0:45 · Don't trust the pitch

**Screen:** scroll to **THE PROBLEM** — the claim-versus-evidence panel.

> "This is a real agent in the registry, read live. Liquidation protection for
> Venus — specific, technical, completely plausible."

**Action:** move across to the right-hand panel.

> "Its endpoint has never answered a single one of our probes. Zero of
> seventy-two. Hiring it is blocked."

> "That's the product in one screen: what an agent says, next to what it does."

---

## 0:45 – 1:10 · The brief

**Screen:** tab 2 — `/discover` with the brief already filled.

> "So: I have five thousand dollars, I want to protect a lending position,
> medium risk, thirty days."

**Action:** point at the results header.

> "Pokter found twelve relevant agents. **Four match my profile** — and the
> rest were ruled out, with a reason for each." **[VERIFY]**

**Action:** click **Why not the others?** and let the list expand.

> "'Answered none of seventy-two probes.' 'No track record to judge on.'
> These aren't categories — they're facts you can go and check."

---

## 1:10 – 1:45 · The evidence

**Screen:** tab 3 — the agent detail page for *Brain on BNB — Venus Health
Factor Monitor*.

> "Here's the one it recommended. **Pokter Score 87** — but look at the line
> underneath: **scored on three of five dimensions**." **[VERIFY]**

**Action:** click the score to expand the breakdown.

> "Performance and risk are marked *not measured*. Nobody publishes realised
> returns for these agents, so we don't invent them. A ninety scored on three
> dimensions is not the same claim as a ninety scored on five, and Pokter never
> lets one pass for the other."

**Action:** scroll to **Why should I trust this agent?**

> "Every row says where it came from. Identity is onchain. Capabilities are
> publisher-declared — nobody checked those. The endpoint result is ours, taken
> when the page loaded."

**Action:** click a provenance tag to open the popover, then the transaction
link.

> "And the attestations trace to the transaction that carries them."

---

## 1:45 – 2:05 · Compare

**Screen:** tab 4 — three agents side by side.

> "Against two alternatives, on the metrics that actually exist."

**Action:** run your cursor down the highlighted column.

> "Uptime, probes taken, independent measurers. Where an agent has no data, the
> row says *not measured* rather than scoring it zero — a missing measurement
> never loses a comparison it was never in."

---

## 2:05 – 2:35 · The permission

**Screen:** tab 5 — the hire flow.

> "Now the part that decides whether any of this matters. Before anything is
> granted, this is what the agent would be allowed to do."

**Action:** rest on the **Can call / Cannot call** panel.

> "Allowlisted contracts, a spend cap, an expiry. And the 'cannot' list is as
> prominent as the 'can' — it can't touch arbitrary contracts, can't move your
> tokens, can't extend its own permissions."

> "This is enforced by the Altana account contract, not by us. A call outside
> it reverts on chain. Pokter couldn't weaken it if it wanted to."

**Action:** switch to `/my-agents`, click a grant transaction.

> "Here's a session we granted, on BSC testnet, and here it is on BscScan.
> Revoked from the same screen — also a transaction."

---

## 2:35 – 3:00 · The position

**Screen:** back to the landing page, scroll to **TRANSPARENCY**.

> "One more thing. Every integration is written up with what worked and what
> fought back. The Altana SDK documents a wallet signer it doesn't implement.
> And it ships a stale ERC-8183 policy address for testnet — which means hiring
> is broken right now for every buyer on the current SDK. We found it, fixed it,
> and reported it upstream."

**Action:** the ERC-8183 card carries a link — **Reported upstream ·
altana-sdk#84**. Put the cursor on it for a beat so it is legible, but do not
click through; the repository is not part of this take.

> "That's the difference between noticing a bug and doing something about it."

**Action:** scroll to the philosophy block. Let it land.

> "Pokter doesn't pretend to know what it can't know. We measure availability.
> We verify attestations. We track evidence. We don't manufacture performance."

**Action:** finish on the closing headline.

> "Choose what deserves your money."

---

## If you have thirty seconds more

Open `/agent-advantage`:

> "We also measured whether hiring an agent beats doing the job yourself. On
> speed it's a draw — one task the agent lost outright. It wins on correctness:
> Venus publishes a per-block rate, and the constant in most documentation
> assumes three-second blocks that BNB Chain stopped producing. Copy it and your
> APR is wrong by a factor of six point seven. The agent got it right."

That is the most credible thirty seconds available, because it includes a loss.

---

## Do not show these

Not because they are embarrassing — they're documented — but because they need
explaining and you don't have the time:

- **Job delivery.** Escrow is funded on-chain and visible, but the jobs sit at
  `FUNDED`: the seller runtime has no poller and its endpoint isn't discoverable
  in the registry. Say "escrowed" and move on; don't imply a deliverable came
  back.
- **Signing with the visitor's wallet.** The connected account gates the step;
  the operator key still signs. The interface says so, but on camera it invites
  a question that costs a minute.
- **Grid Trading with a strict filter.** It has the thinnest evidence of the
  four categories. Demo Health Factor, which has the strongest.

---

## If a judge pushes

**"How do we know these numbers are real?"**
Every figure links to its source. Open any provenance tag, then the transaction.
The methodology page lists the thresholds, imported from the code that enforces
them, so the page cannot describe a rule the product doesn't follow.

**"What happens when an agent has no data?"**
It's marked Unproven and blocked from hire. That's not a low score — it's the
absence of a measurement, and we never merge the two.

**"Is this just uptime monitoring?"**
Partly, and we say so. Reliability is one of five dimensions; the score shows
its own coverage; and the methodology states plainly that liveness is not
correctness — an agent that answers every probe can still trade badly.
