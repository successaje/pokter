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

## 0:00 – 0:20 · Cold open · *animated, no product*

The only twenty seconds that are not screen recording. It exists to make the
scale legible before the app has to explain anything, and it ends on the
sentence the product is named for.

**Beat 1 (0:00 – 0:07).** A field of small agent cards fills the frame, far too
many to count. A counter runs up to **306,000**.

> "BNB Chain has three hundred and six thousand registered agents."

**Beat 2 (0:07 – 0:14).** Cards begin falling away in waves, each wave labelled
as it goes: `no endpoint`, `never answered`, `no evidence`, `bulk-minted clone`.
The field thins fast. This is the whole argument — the narrowing is the product.

> "Almost none of them can be checked."

**Beat 3 (0:14 – 0:20).** A handful remain, and settle. The counter beneath them
reads **38 measured**.

> "Pokter measures the ones that can."

Then cut straight to the live site. No logo card, no title sequence — the cut
from the animation to the real product is the point, and a title slide would
blunt it.

**Producing it.** Two honest options:

1. **Screen-record the landing page instead.** The hero already animates: the
   agent scene, the drifting event cards, the pipeline. It costs nothing, it is
   real product, and it cannot look worse than it does in the browser.
2. **Build it as a page and record that**, so it inherits the design system and
   the numbers come from the same source as everything else.

Do not hand-animate this in a video editor unless you are quick at it. It is the
highest-effort, lowest-scoring part of the take, and a rough animation in front
of a strong demo reads worse than no animation at all.

---

## 0:20 – 0:30 · The landing

**Screen:** the landing hero, live. Let the agent scene animate for two seconds
before speaking — the event cards drift in on their own, and they are real
events, not decoration.

The cold open already gave the numbers. Do not repeat them here; this beat
exists to show that the thing in the animation is an actual product.

> "That is this. Every figure on the page carries where it came from — measured,
> attested, or merely declared — and it will never let you confuse the three.
> The identities and the attestations come from 8004scan, which is what makes
> three hundred thousand agents addressable in the first place."

**Action:** one slow scroll to the ecosystem figures, then stop. The counters
animate as they enter, so scrolling fast scrubs past the animation and it reads
as static.

*Twelve seconds is tight. If you overrun here, take it out of Compare, not out
of the evidence beat.*

---

## 0:30 – 0:50 · Don't trust the pitch

**Screen:** scroll to **THE PROBLEM** — the claim-versus-evidence panel.

> "This is a real agent in the registry, read live. Liquidation protection for
> Venus — specific, technical, completely plausible."

**Action:** move across to the right-hand panel.

> "Its endpoint has never answered a single one of our probes. Zero of
> seventy-two. Hiring it is blocked."

> "That's the product in one screen: what an agent says, next to what it does."

---

## 0:50 – 1:12 · The brief

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

## 1:12 – 1:45 · The evidence

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

## 1:45 – 1:55 · Compare

**Screen:** tab 4 — three agents side by side.

> "Against two alternatives, on the metrics that actually exist."

**Action:** run your cursor down the highlighted column.

> "Uptime, probes taken, independent measurers. Where an agent has no data, the
> row says *not measured* rather than scoring it zero — a missing measurement
> never loses a comparison it was never in."

---

## 1:55 – 2:10 · What it costs · *tab 7 — `/pool-check`*

**Screen:** `/pool-check`, WBNB/USDT selected.

> "Before you hand a PancakeSwap position to anyone, there is a question nobody
> answers for you: will this agent pay for itself?"

**Action:** point at the break-even figure, then switch the pool to CAKE/WBNB
and let the number jump.

> "This reads the live V3 pool — the fee tier, and the liquidity actually
> sitting at the current tick — and prices what running an agent costs you.
> Same agent, same position: it needs to earn one-point-seven percent on
> WBNB/USDT, and nine-point-two on CAKE/WBNB."

> "And notice what it will not do. It never tells you the agent *will* make that
> back, because nobody publishes agent returns. It gives you the bar, and you
> hold the agent to it."

*The pool switch is the beat. Do it slowly enough that the jump registers — one
number moving five-fold is the argument.*

---

## 2:10 – 2:42 · The permission

**Screen:** tab 5 — the hire flow.

> "Now the part that decides whether any of this matters. Before anything is
> granted, this is what the agent would be allowed to do."

**Action:** rest on the **Can call / Cannot call** panel. No wallet is needed
for any of this — the review renders for everyone, and only the signing button
is held back.

> "Allowlisted contracts, a spend cap, an expiry. And the 'cannot' list is as
> prominent as the 'can' — it can't touch arbitrary contracts, can't move your
> tokens, can't extend its own permissions."

> "And this is the part I want to be precise about: none of it is enforced by
> Pokter. It is enforced by the Altana account contract. The allowlist, the
> spend cap, the expiry — a call outside them reverts on chain. Pokter could
> not weaken this if it wanted to, and that is exactly why it is worth
> trusting. A permission model your marketplace can override is not a
> permission model."

**Action:** stay on this page and press **Authorize agent**. Do not navigate
away — the whole lifecycle happens here.

> "So let's actually do it."

*Wait for it. If you are signing with a passkey, the biometric prompt appears
now; let it be visible rather than cutting around it. Registration takes a few
seconds.*

**Action:** the panel resolves in place to **Agent activated**, with the session
key, the wallet, the expiry and the grant transaction.

> "That's a real session, on BSC testnet, registered in the Altana Keystore.
> There's the transaction."

**Action:** press **Revoke access**, still without leaving the page.

> "And because a permission you cannot withdraw is not a permission — revoked.
> Also a transaction. Granted and ended, in front of you, in about twenty
> seconds."

*This is the most convincing twenty seconds in the video: two real state
changes on a public chain, on camera, with no cuts. Do not rush it and do not
narrate over the waiting — silence while a transaction confirms reads as
confidence.*

---

## 2:42 – 3:00 · The escrow · *same page, stage 2*

**Screen:** scroll down to **Commission work** — still the hire page, wallet
still connected.

> "A permission lets an agent act. This is the other half: paying it for a
> specific piece of work."

**Action:** press **Commission for 0.1 $U** and wait.

> "That funds an ERC-8183 escrow on BNB Chain. The money is held by the kernel,
> not by the agent and not by us, and it only releases when work is delivered."

**Action:** the panel resolves in place — job number, the progress track, and
the hire transaction.

> "There's the job, there's the transaction — and look where it stops. Funded.
> The seller's runtime has no poller, so nothing has come back yet, and we show
> you that rather than a finished result we don't have."

> "Which is the same rule as everything else here. If it hasn't happened, we
> don't claim it has."

*The track stopping two stages short is the point, not a gap to apologise for.
Say it plainly and move on — a judge who sees you name your own unfinished edge
believes the rest of the screen.*

---

## 3:00 – 3:12 · The position

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

---

## 3:12 – 3:24 · Close

**Action:** hold for a beat before the closing lines.

> "This matters more than a directory. We are about to let software move real
> money on real chains, on our behalf, while we sleep. The thing standing
> between that being useful and that being a disaster is whether anyone can
> tell a good agent from a convincing one. Right now, mostly, they can't."

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
