# YouTube upload

Figures below were live on 8 September 2026. Re-check with `npm run figures` if
you upload later — they move every two hours.

---

## Visibility

**Unlisted.** Anyone with the link can watch, it will not appear in search or on
your channel, and judges need no account. Public invites stray comments on a
submission you cannot edit after the deadline; private would lock judges out
entirely, which is the one failure mode that costs you everything.

Also: **turn off "Made for kids"** (it disables the link-sharing behaviours you
want), and leave comments on — a judge asking a question there is a good problem.

---

## Title

Keep it under 60 characters so it does not truncate.

**Use this:**

```
Pokter — Choose what deserves your money | BNB Chain hackathon
```

Alternatives if you prefer:

```
Pokter — the decision layer for autonomous finance on BNB Chain
Pokter — verify agents before you pay them | Smart Money Era
```

---

## Description

Paste everything between the rules. The first two lines are what shows before
"…more", so the live link sits there deliberately.

**Fill in the chapters yourself.** The cut ran to 5:33 rather than the scripted
3:16, so I do not know where your sections landed and will not guess —
timestamps that are wrong are worse than none, and YouTube requires the first to
be `0:00` with at least three of them, each 10s or more apart. Scrub through
once and note where each section starts; it takes about two minutes and it is
the single highest-value thing in the description, because it lets a judge jump
straight to the two live transactions.

---

Pokter is the decision layer for autonomous finance on BNB Chain.
Live: https://pokter.fly.dev · Code: https://github.com/successaje/pokter

Built for the BNB Chain "Smart Money Era" hackathon.

BNB Chain has 309,000+ registered agents. Finding one was never the hard part —
knowing which one deserves your capital is. We started by measuring the registry
rather than assuming it, and the state of it is worse than "hard to search": the
top-scored agents carry zero attestations, whole stretches are bulk-minted clones
sharing a single description, and agents describing real strategies routinely
publish endpoints that have never answered anything. One in this video advertises
Venus liquidation protection in convincing technical detail and has answered none
of our probes.

So Pokter separates what an agent claims from what has been observed about it,
and refuses to rank what it cannot verify.

It decodes on-chain attestations into the measurer, the methodology and the
defects that measurer disclosed about its own method. Because so few agents carry
attestations at all, it probes them itself on a schedule and accumulates its own
track record — 2,400+ probes so far, continuing every two hours. A probe counts
as answered only on well-formed JSON; an HTTP 200 from a proxy is not an answer.

It scores agents on five weighted dimensions, two of which are permanently marked
"not measured" — nobody publishes realised returns, and inferring them from
uptime would be fabrication. The score rescales across what is left and its
coverage travels with it, so an 86 scored on three dimensions never passes for an
86 scored on five. Agents with no evidence are blocked from hire rather than
ranked last with a filler score.

Then it hires. A scoped Altana session — allowlisted contracts, spend cap,
expiry — registered in the on-chain KeyStore and revocable from the interface.
And an ERC-8183 job escrowed from the product itself, with the budget held by the
kernel rather than by the agent or by us.

Both transactions in this video are real and were signed live on camera.

CHAPTERS
0:00 [fill in — the problem]
0:00 [fill in — don't trust the pitch]
0:00 [fill in — the brief]
0:00 [fill in — the evidence]
0:00 [fill in — compare]
0:00 [fill in — will this agent pay for itself? PancakeSwap]
0:00 [fill in — granting a scoped permission, live]
0:00 [fill in — funding an ERC-8183 escrow, live]
0:00 [fill in — what fought back]
0:00 [fill in — close]

ON-CHAIN EVIDENCE (BSC testnet, all verifiable)
Session granted + registered in Altana KeyStore:
https://testnet.bscscan.com/tx/0x62b049db108673c41bbe8a9d9cebbdffb1e06451db3ba2db31c88a035a1233bd
ERC-8183 job hired and escrowed:
https://testnet.bscscan.com/tx/0x93385d5708964b0b6257b24b38ee00149fc53112445030d7227d43a6d90f9ac5
Session revoked (earlier):
https://testnet.bscscan.com/tx/0x9eaf149e9e9cdd14e7fb192a699d8b62b1d06d3c7239b8e2f50eb8de12a9eae6
Altana Keystore explorer, keys live now:
https://testnet.altana.network/account/0x60eF148485C2a5119fa52CA13c52E9fd98F28e87

BUILT WITH
8004scan (AltLayer) — ERC-8004 identity and reputation, the layer that makes
300,000 agents addressable at all
Altana — scoped sessions, enforced by the account contract rather than by our UI.
A call outside the allowlist reverts on chain; Pokter could not weaken it if it
wanted to
BNB Chain — ERC-8183 job escrow
PancakeSwap — V3 pools, both as execution venue and as the live pricing behind
the cost check
TermiX — the Agent Advantage report

FOR PANCAKESWAP LPs
/pool-check reads a live V3 pool — the fee tier and the liquidity actually
sitting at the current tick — and prices what running an agent costs on a
position: pool fees, price impact, gas, and the agent's own fee. It reports a
break-even, the improvement in fee capture an agent must deliver before hiring it
leaves you better off. It never claims the agent will earn that back, because
nobody publishes agent returns. The cost is computed because it can be; the
benefit is refused because it cannot.

WHAT WE FOUND IN THE SDK
Exercising ERC-8183 hard enough surfaced a real defect: the SDK shipped a stale
policy address for BSC testnet, so every hire reverted with an undecodable
selector. We isolated it by running the batch's five calls individually and ruling
out funding, the documented jobId race, relay nonce artifacts and a platform
outage before diffing two SDKs' address tables. Reported upstream; it turned out to
have been fixed the day before in a release we had not yet seen, which we say
plainly rather than claiming a live bug. The follow-up finding still stands: the
exported ABIs carry no error fragments at all, so no revert from these contracts
is decodable by viem or ethers.

WHAT DOES NOT WORK, STATED ON PURPOSE
Funded jobs stop at FUNDED. The escrow is real and on-chain, but the seller's
runtime has no poller, so nothing has been delivered — and the interface shows
that rather than a completion we cannot evidence.
Browser wallets cannot sign session grants. An Altana wallet is an EIP-7702
account and extension wallets deliberately withhold the required signature. The
passkey path does work and gives real custody, and the interface always states
which key signed.
Performance and risk are never scored. Nobody publishes the data.

Sessions and escrow run on BSC testnet, and every surface showing one says so.

Pokter doesn't pretend to know what it can't know. We measure availability. We
verify attestations. We track evidence. We don't manufacture performance.

---

## Tags

```
BNB Chain, ERC-8004, ERC-8183, AI agents, agent marketplace, DeFi, PancakeSwap,
Altana, 8004scan, autonomous agents, onchain reputation, smart money era,
hackathon, agent economy, BSC
```

---

## Thumbnail

If you make one, the highest-signal frame in the whole video is the
claim-versus-evidence panel — a confident agent pitch beside **0 of 72 probes
answered**. That single image is the entire argument, and it will out-perform a
logo.

Add text only if it is short: **"0 of 72 probes answered."** Nothing else.

---

## After uploading

1. Watch the first 20 seconds back on a phone. Text that is legible on your
   monitor often is not at 360p, and the counters matter.
2. ~~Paste the link into the README~~ — done: https://youtu.be/KyuKia6RL9s
3. Check the link works in a private window while signed out.
