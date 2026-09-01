# Submission form — paste-ready copy

Refresh the probe count before submitting: it grows every two hours.
Current figures live at https://pokter.fly.dev

---

## PROJECT DESCRIPTION

Pokter is the decision layer for autonomous finance on BNB Chain. It answers the
question a marketplace leaves open: not "where are the agents?" but "which one
deserves my money?"

We started by measuring the ERC-8004 registry instead of assuming it. It holds
297,000+ agents, and the state of it is worse than hard to search — the
top-ranked agents by score carry zero attestations, whole stretches are
bulk-minted clones sharing one description, and agents describing real
strategies routinely publish dead endpoints. One advertising Venus liquidation
protection, in convincing technical detail, has answered none of our probes.

So Pokter separates what an agent claims from what has been observed about it,
and refuses to rank what it cannot verify.

It discovers agents across four categories using hybrid retrieval, decodes
on-chain attestations into the measurer and methodology behind each figure, and
— because so few agents carry attestations — probes them itself on a schedule,
accumulating its own track record. It scores them on five weighted dimensions,
two of which are permanently marked "not measured", because nobody publishes
realised returns and we will not infer them from uptime. It recommends against
your brief with a checkable reason for every rejection. Then it hires: a scoped
Altana session with an allowlist, spend cap and expiry, registered on-chain and
revocable, and an ERC-8183 job escrowed from the product itself.

Unproven agents are blocked from hire rather than ranked last with a filler
score. Every number links to its source. The methodology page imports its
thresholds from the code that enforces them, so it cannot describe a rule the
product does not follow.

Pokter doesn't pretend to know what it can't know. We measure availability, we
verify attestations, we track evidence, and we don't manufacture performance.

Live: https://pokter.fly.dev

---

## PROJECT DESCRIPTION — short variant (if the field is tight)

Pokter is the decision layer for autonomous finance on BNB Chain. BNB Chain has
297,000+ registered agents; the hard part was never finding one, it is knowing
which deserves your capital.

Pokter separates what an agent claims from what has been observed about it. It
decodes on-chain attestations, probes agents itself on a schedule, scores them
on five dimensions — two permanently marked "not measured" because nobody
publishes returns — and blocks unproven agents from hire rather than ranking
them last with a filler score. Then it hires: a scoped Altana session with an
allowlist, spend cap and expiry, registered on-chain and revocable.

Every number links to its source. Live at https://pokter.fly.dev

---

## ADDITIONAL NOTES

**Live:** https://pokter.fly.dev — **Source:** https://github.com/successaje/pokter

**On-chain evidence (BSC testnet, all verifiable):**
- Altana session granted + registered in KeyStore: `0x62a590ae974dd86ee0576c0ce2339afa97902430ac49fb4937de817a7f86019a`
- Session revoked: `0x9eaf149e9e9cdd14e7fb192a699d8b62b1d06d3c7239b8e2f50eb8de12a9eae6`
- ERC-8183 job hired end-to-end from the product: `0x40b9fe982b9af6542342c7cea3fbefeabb913e868aadbe15ca153de9ea9e87a8`
- Escrow funded: `0x711855b98171278e47e51e891d454dc9ef1def728c58e837466ba20085cc7599`

**The permission scoping is enforced on-chain, not in our UI.** We granted two
sessions with deliberately different scopes and diffed the calldata: the
rebalancer grant carries the PancakeSwap Position Manager address, and the
monitoring grant — whose allowlist is empty by design — does not. Calls outside
the scope revert inside the Altana account contract.

**A bug worth reporting upstream.** `@altananetwork/sdk@0.8.0` ships a stale
OptimisticPolicy address for BSC testnet. Every ERC-8183 hire reverts with an
undecodable `0xc94463e3` and then `0x32d53d69`, because an unregistered job
cannot be funded. We isolated it by running the batch's five calls individually,
ruled out funding, the documented jobId race, relay nonce artifacts and a
platform outage, then found the correct address by diffing against
`@bnbagent/sdk`. This breaks ERC-8183 hiring for every testnet buyer on that
SDK; the full trace is in docs/integrations/erc8183.md.

**TermiX Agent Advantage** (docs/termix-agent-advantage.md, and the
/agent-advantage page): three tasks, each run through a live third-party agent
and again from primary sources, timed, outputs quoted. On raw speed it is a
draw, and one task the agent lost outright by 3.3×. It wins on correctness:
Venus publishes a per-block rate, and the blocks-per-year constant in most
documentation assumes three-second blocks BNB Chain no longer produces. An
analyst copying it computes 0.43% where the true figure is 2.84% — wrong by
6.67× with no error to warn them. The agent got it right. Our manual baseline
was performed by an AI assistant rather than a human, so the timings are
machine-to-machine, and we say so rather than inventing a human figure.

**Known limitations, stated deliberately:**
- Funded ERC-8183 jobs sit at FUNDED. Escrow is on-chain and visible, but the
  seller runtime has no poller and its endpoint is not discoverable in the
  registry, so we cannot notify it.
- The visitor's browser wallet does not sign session grants. The Altana SDK
  documents `signerFromInjected` but neither exports nor implements it, and
  browser wallets no longer expose the raw digest signing a session requires. We
  built the WebAuthn passkey path, which does give real custody, and the
  interface always states which key signed.
- Performance and risk are never scored, because nobody publishes the data.

Each integration is written up in docs/integrations/ with the exact error it
produced and the fix where there was one. A submission listing only successes
is a claim; one naming its failures is a report.

**Sessions and escrow run on BSC testnet, and every surface showing one says so.**
