# Pokter — voiceover

Read this against the cut you recorded. Roughly 400 words, which lands near
3:05 at a normal speaking pace.

**There is no animated cold open.** It opens on the landing page instead, whose
hero already animates and whose counters carry the same two numbers the
animation was going to state. Real product doing the job, and one less thing
that can look cheap.

**Delivery.** Slow down rather than speed up. Every gap marked *(pause)* is
doing work — especially the ones over transactions confirming, where silence
reads as confidence and chatter reads as nerves. Do not sell. The whole point of
the product is that it does not oversell, and a voice that pitches will fight
the thing on screen.

Figures verified on the live site today. If you re-record after a sweep, check
them with `npm run figures`.

---

## Opening — over the landing page

*No animation. The hero already moves: the agent scene animates, the event cards
drift in on their own, and the counters run as they enter. That is real product
doing the job a title sequence was going to fake.*

*Open on the hero. Let it move for two full seconds before speaking.*

> BNB Chain has three hundred and seven thousand registered agents.
>
> *(pause — begin the slow scroll toward the counters)*
>
> Finding one was never the hard part.
>
> *(the counters land — registered against monitored)*
>
> Pokter has measured thirty-nine of them. That gap is the whole problem.
>
> *(pause — let the two numbers sit together)*
>
> Because every figure on this page carries where it came from. Measured,
> attested, or merely declared — and it will never let you confuse the three.
>
> The identities and the attestations come from 8004scan, which is what makes
> three hundred thousand agents addressable in the first place.

---

## Don't trust the pitch

> This is a real agent in the registry, read live. Liquidation protection for
> Venus — specific, technical, completely plausible.
>
> *(pause, moving to the right-hand panel)*
>
> Its endpoint has never answered a single one of our probes. Not one. Hiring it
> is blocked.
>
> That is the product in one screen. What an agent says, next to what it does.

---

## The brief

> So — I have five thousand dollars, I want to protect a lending position,
> medium risk, thirty days.
>
> Pokter doesn't rank these on what they claim about themselves. It ranks on
> what has actually been measured, and it tells you how many it considered to
> get here.

---

## The evidence

> Here's what it recommended. Beefy, powered by HeyAnon. Pokter Score
> eighty-six.
>
> *(pause)*
>
> But look at the line underneath. Scored on three of five dimensions.
>
> Performance and risk are marked *not measured*. Nobody publishes realised
> returns for these agents, so we don't invent them. An eighty-six scored on
> three dimensions is not the same claim as an eighty-six scored on five, and
> Pokter never lets one pass for the other.
>
> *(scrolling)*
>
> Underneath, every row says where it came from. Identity is on-chain.
> Capabilities are publisher-declared — nobody has checked those. And this is
> ours: a hundred percent availability, eighty-eight probes, a hundred and
> sixty-eight milliseconds median, observed over eight days.
>
> Proven, here, means two independent measurers and a hundred and sixty-four
> probes. Not a badge we award ourselves.

---

## Compare

> Against alternatives, on the metrics that actually exist.
>
> Uptime, probes taken, independent measurers. And where an agent has no data,
> the row says so rather than scoring it zero — a missing measurement never
> loses a comparison it was never in.

---

## Pool check

> Before you hand a PancakeSwap position to anyone, there's a question nobody
> answers for you. Will this agent pay for itself?
>
> This reads the live V3 pool — the fee tier, and the liquidity actually sitting
> at the current tick — and prices what running an agent costs you.
>
> *(as the pool switches)*
>
> Same agent, same position. It needs to earn one-point-seven percent on
> WBNB/USDT. Nine-point-two on CAKE/WBNB.
>
> And notice what it won't do. It never tells you the agent *will* earn that
> back, because nobody publishes agent returns. It gives you the bar. You hold
> the agent to it.

---

## The permission

> Now the part that decides whether any of this matters. Before anything is
> granted, this is exactly what the agent would be allowed to do.
>
> Allowlisted contracts, a spend cap, an expiry. And the *cannot* list is as
> prominent as the *can* — it can't touch arbitrary contracts, can't move your
> tokens, can't extend its own permissions.
>
> I want to be precise about this next part. None of it is enforced by Pokter.
> It's enforced by the Altana account contract. A call outside these limits
> reverts on chain. Pokter could not weaken this if it wanted to — and that is
> exactly why it's worth trusting. A permission model your marketplace can
> override isn't a permission model.
>
> *(pressing Authorize)*
>
> So let's actually do it.
>
> *(silence while it confirms — do not fill this)*
>
> That's a real session, on BSC testnet, registered in the Altana Keystore.
> There's the transaction.

---

## The escrow

> A permission lets an agent act. This is the other half — paying it for a
> specific piece of work.
>
> *(pressing Commission)*
>
> That funds an ERC-8183 escrow on BNB Chain. The money is held by the kernel.
> Not by the agent, and not by us. It only releases when work is delivered.
>
> *(silence while it confirms)*
>
> There's the job. There's the transaction.
>
> *(pause)*
>
> And look where it stops. Funded. The seller's runtime has no poller, so
> nothing has come back yet — and we show you that, rather than a finished
> result we don't have.
>
> Which is the same rule as everything else here. If it hasn't happened, we
> don't claim it has.

---

## The position

> One more thing. Every integration is written up with what worked and what
> fought back.
>
> The Altana SDK ships a stale ERC-8183 policy address for testnet — which means
> hiring is broken right now for every buyer on the current version. We found
> it, worked around it, and reported it upstream.
>
> That's the difference between noticing a bug and doing something about it.

---

## The close

> This matters more than a directory.
>
> We are about to let software move real money, on real chains, on our behalf,
> while we sleep. The thing standing between that being useful and that being a
> disaster is whether anyone can tell a good agent from a convincing one.
>
> *(pause)*
>
> Right now, mostly, they can't.
>
> *(pause — let the philosophy block land on screen)*
>
> Pokter doesn't pretend to know what it can't know. We measure availability. We
> verify attestations. We track evidence. We don't manufacture performance.
>
> *(final pause, on the headline)*
>
> Choose what deserves your money.

---

## If a line doesn't match your cut

- **The brief** avoids naming a rejection count, since *Why not the others?*
  didn't appear on your run. If your recording does show a ruled-out figure, add
  *"and it shows you what it ruled out, with a reason you can check"* after the
  second sentence.
- **The permission** has no revoke line, because you didn't revoke on camera. If
  you cut one in later, the line is: *"And because a permission you cannot
  withdraw is not a permission — revoked. Also a transaction."*
- **BscScan.** You cut to the explorer for both transactions; the narration
  above lands naturally over it without extra words. If you need to fill the
  gap, *"on a public chain, anyone can check it"* is the line — once, not twice.
