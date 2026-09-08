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

Paste everything below the line. The first two lines are what shows before
"…more", so the live link sits there deliberately.

---

Pokter is the decision layer for autonomous finance on BNB Chain.
Live: https://pokter.fly.dev · Code: https://github.com/successaje/pokter

Built for the BNB Chain "Smart Money Era" hackathon.

BNB Chain has 309,000+ registered agents. Finding one was never the hard part —
knowing which deserves your capital is. The top-scored agents in the registry
carry zero attestations, and agents describing real strategies routinely publish
endpoints that have never answered anything.

Pokter separates what an agent claims from what has been observed about it, and
refuses to rank what it cannot verify. It decodes on-chain attestations to the
measurer behind each figure, probes agents itself on a schedule, and scores them
on five dimensions — two of which are permanently marked "not measured", because
nobody publishes realised returns and we will not infer them from uptime.

Then it hires: a scoped Altana session with an allowlist, spend cap and expiry,
registered on-chain and revocable, plus an ERC-8183 job escrowed from the product
itself. Both transactions in this video are real and were signed live.

CHAPTERS
0:00 The problem — 309,000 agents, 40 measured
0:22 Don't trust the pitch
0:42 Telling Pokter what you actually want
1:04 The evidence, and what it refuses to score
1:37 Comparing on metrics that exist
1:47 Will this agent pay for itself? (PancakeSwap)
2:02 Granting a scoped permission, live
2:34 Funding an ERC-8183 escrow, live
2:52 What fought back
3:04 Choose what deserves your money

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
Altana — scoped sessions, enforced by the account contract rather than by our UI
BNB Chain — ERC-8183 job escrow
PancakeSwap — V3 pools, both as execution venue and as the live pricing behind
the cost check
TermiX — the Agent Advantage report

WHAT DOES NOT WORK, STATED ON PURPOSE
Funded jobs stop at FUNDED: the escrow is real and on-chain, but the seller's
runtime has no poller, so nothing has been delivered and the interface says so.
Browser wallets cannot sign session grants — an Altana wallet is an EIP-7702
account and extension wallets withhold the required signature. The passkey path
does work and gives real custody.
Performance and risk are never scored. Nobody publishes the data.

Sessions and escrow run on BSC testnet, and every surface showing one says so.

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
2. Paste the link into the README — replace `_<paste the link here>_` at the
   top. The submission form has no video field, so the README is the only route
   judges have to it.
3. Check the link works in a private window while signed out.
