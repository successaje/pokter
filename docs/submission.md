# Pokter — submission

**Live:** https://pokter.fly.dev · **Source:** https://github.com/successaje/pokter
**Track:** Main — BNB Agent Studio Marketplace
**Also entering:** Altana · TermiX · PancakeSwap · 8004scan

---

## One line

Pokter is the decision layer for autonomous finance on BNB Chain: it turns
onchain activity, attestations and live execution data into evidence you can
check, then lets you hire an agent with permissions you set and can revoke.

---

## The problem we actually found

We started by measuring the registry rather than assuming it. The ERC-8004
registry on BSC holds **297,000+ agents**, and the state of it is worse than
"hard to search":

- The top-ranked agents by score carry **zero attestations**.
- Whole stretches are minted in bulk — dozens of sequentially named agents
  sharing one identical description.
- Agents that describe a real strategy frequently publish an endpoint that is
  dead. One we measured answered **0 of 32 probes** while advertising Venus
  liquidation protection in convincing technical detail.

So the hard problem is not presentation. It is that a user is being asked to
delegate wallet authority to a strategy whose only track record is a number the
agent wrote about itself.

**Pokter's answer: separate what an agent claims from what has been observed
about it, and refuse to rank what cannot be verified.**

---

## What it does

**Discovers.** Hybrid retrieval — semantic, keyword and publisher tags —
because semantic search alone returned generic trading bots for grid strategies
while thirteen agents with "Grid" in the name sat unretrieved. Bulk-minted
clones are collapsed to one representative.

**Verifies.** Attestations are read from chain via 8004scan and decoded from
their `feedback_uri` into the measurer, the methodology, the probe counts and
the defects that measurer disclosed about its own method. Every figure links to
the transaction carrying it.

**Measures.** Because so few agents carry attestations, Pokter probes them
itself on a schedule and accumulates a track record — **520 probes** to date,
continuing every two hours. A probe counts as answered only on well-formed
JSON; an HTTP 200 from a proxy is not an answer.

**Scores.** Five weighted dimensions, versioned so rankings stay reproducible.
Two of them — performance and risk — are **permanently marked "not measured"**,
because nobody publishes realised returns and we will not infer them from
uptime. The score rescales across measurable dimensions and its coverage
travels with it: a 90 scored on three dimensions never passes for a 90 scored
on five.

**Recommends.** Against a brief (capital, objective, risk, horizon), with every
rejection carrying a checkable reason. Filtering and explanation happen in one
pass, so the stated reason cannot drift from the decision.

**Permits.** A scoped Altana session — allowlisted contracts, spend cap,
expiry — registered in the on-chain KeyStore and revocable from the product.

**Monitors.** Live permissions and escrowed jobs, each linked to its
transaction.

---

## Evidence it works

Everything below is on BSC testnet and verifiable.

| | |
| --- | --- |
| Altana session granted + KeyStore registered | [`0x62a590ae…`](https://testnet.bscscan.com/tx/0x62a590ae974dd86ee0576c0ce2339afa97902430ac49fb4937de817a7f86019a) |
| Session revoked | [`0x9eaf149e…`](https://testnet.bscscan.com/tx/0x9eaf149e9e9cdd14e7fb192a699d8b62b1d06d3c7239b8e2f50eb8de12a9eae6) |
| ERC-8183 job hired end-to-end from the product | [`0x40b9fe98…`](https://testnet.bscscan.com/tx/0x40b9fe982b9af6542342c7cea3fbefeabb913e868aadbe15ca153de9ea9e87a8) |
| Escrow funded | [`0x711855b9…`](https://testnet.bscscan.com/tx/0x711855b98171278e47e51e891d454dc9ef1def728c58e837466ba20085cc7599) |
| Live session granted from the product | [`0x62b049db…`](https://testnet.bscscan.com/tx/0x62b049db108673c41bbe8a9d9cebbdffb1e06451db3ba2db31c88a035a1233bd) |
| Live job hired and escrowed | [`0x93385d57…`](https://testnet.bscscan.com/tx/0x93385d5708964b0b6257b24b38ee00149fc53112445030d7227d43a6d90f9ac5) |
| Altana Keystore explorer, active | [root + session key both live](https://testnet.altana.network/account/0x60eF148485C2a5119fa52CA13c52E9fd98F28e87) |
| Altana Keystore explorer, ended | [3 sessions expired or revoked](https://testnet.altana.network/account/0xAe4473468F10b507AB410077FA266FD8c5Af2196) |

**The permission scoping is enforced on-chain, not in our UI.** We granted two
sessions with deliberately different scopes and diffed the calldata: the
rebalancer grant carries the PancakeSwap Position Manager address; the
monitoring grant, whose allowlist is empty by design, does not. A call outside
the scope reverts inside the Altana account contract. Pokter could not weaken
it if it wanted to.

---

## Sponsor tracks

**Altana — 9/9 on the checklist.** Own wallet, session key, spend cap, contract
allowlist, expiry, on-chain registration, real transactions, revocation,
evidence captured.

**ERC-8183.** Jobs created, registered, funded and escrowed from the product in
one atomic batch. Getting there meant finding that
`@altananetwork/sdk@0.8.0` **ships a stale OptimisticPolicy address for BSC
testnet** — every hire reverted with an undecodable `0xc94463e3` until we
diffed the address table against `@bnbagent/sdk` and overrode chain 97. That
bug breaks ERC-8183 hiring for every testnet buyer on that SDK, and it is
written up with the trace.

**TermiX — Agent Advantage.** Three tasks, each run through a live third-party
agent and again from primary sources, timed, with outputs quoted. The result is
not the flattering one: **on speed it is a draw, and one task the agent lost
outright** by 3.3×. It wins on correctness — Venus publishes a per-block rate,
and the blocks-per-year constant in most documentation assumes three-second
blocks BNB Chain no longer produces. An analyst copying it computes **0.43%
where the true figure is 2.84%**, wrong by 6.67× with no error to warn them.
The agent got it right. We also state that our manual baseline was run by an AI
assistant rather than a human, so the comparison is machine-to-machine.

**PancakeSwap.** Beyond allowlisting the Router and Position Manager as
execution venues, `/pool-check` gives LPs something they cannot get elsewhere:
what an agent would cost on their actual position, priced against live V3 pool
state, expressed as the break-even improvement in fee capture the agent has to
deliver. The cost side is computed exactly because it can be; the benefit is
refused because no agent publishes returns. On a $25,000 position rebalancing
eight times a month, the same agent must earn 1.70% on WBNB/USDT and 9.20% on
CAKE/WBNB — the kind of difference that decides whether delegating is sensible
at all.

**8004scan.** The discovery and reputation backbone. Server-side only, key never
reaching the browser, cached and rate-limited, with in-flight request
coalescing after we measured a cold page at 88s and traced it to concurrent
renders all missing an empty cache.

---

## Against the judging criteria

**Functionality.** The journey completes: discover → evidence → compare →
permissions → escrow → monitoring, publicly, at ~1.3s per page. Eleven routes,
no dead ends. Deployed on a persistent volume specifically so the accumulated
track record survives — a marketplace whose evidence resets on deploy is not
one.

**Data quality.** Weighted equally with the other two, and the one we optimised hardest for. Every number
traces to a source and is labelled with who counted it. Declared facts and
observed facts are never mixed — `tag:` matches publisher metadata,
`is:proven` and `has:probes>10` match measurements. Missing data is shown as
missing: a threshold is never satisfied by an unmeasured agent, and unproven
agents are blocked from hire rather than ranked last with a filler score. The
methodology page imports its thresholds from the code that enforces them, so it
cannot describe a rule the product does not follow.

**Agent diversity.** All four categories are first-class: dedicated
pages, category-specific focus metrics, category-aware ranking, and an even
index across all four. Building the compare page exposed a classification gap —
"BSC Grid Planner" was unclassified — which we fixed by weighting names above
prose, since a publisher naming their agent "Grid Planner" is declaring its
category.

---

## What does not work, and why we are saying so

- **Funded jobs sit at `FUNDED`.** Escrow is on-chain and visible, but the
  seller runtime has no poller and its endpoint is not discoverable in the
  registry, so we cannot notify it.
- **The visitor's wallet does not sign.** The SDK ships no injected-wallet
  signer. 0.8.0 carried a doc comment naming `signerFromInjected` that was
  never implemented; 0.9.0 removed the comment and the gap remains. Browser
  wallets also no longer expose the raw digest `Signer.signDigest` needs. We built the
  passkey path, which does give real custody, and the interface states which key
  signed.
- **Performance and risk are never scored.** Nobody publishes the data.

Each is written up in `docs/integrations/` with the exact error. A submission
that lists only successes is a claim; one that names its failures is a report.

---

## The position

Pokter doesn't pretend to know what it can't know. We measure availability. We
verify attestations. We track evidence. We don't manufacture performance.

The credibility of the product is part of the product — which is why the
landing page shows a real agent whose pitch outruns its evidence, the last
probes verbatim including the failures, and a section naming what fought back.

**Choose what deserves your money.**
