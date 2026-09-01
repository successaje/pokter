# Submission form — paste-ready copy

Refresh the probe count before submitting: it grows every two hours.
Current figures live at https://pokter.fly.dev

---

## PROJECT DESCRIPTION — 800 character limit

> In 800 characters or less, describe how your marketplace vision is
> unique and what features you have optimized for.

(739 characters)

Most marketplaces rank agents by what they claim. Pokter ranks by what has been observed, and refuses to rank what it cannot verify.

The BNB registry holds 297K agents, and its top-scored ones carry zero attestations. So we separate declared facts from measured ones: attestations decoded from chain to the measurer behind each figure, and agents nobody has checked probed by us on a schedule.

Optimised for provenance — every number links to its source; honest absence — two of five score dimensions permanently read "not measured", because nobody publishes returns; and scoped delegation — an allowlist, spend cap and expiry, enforced on-chain and revocable.

Unproven agents are blocked from hire, not ranked last with a filler score.

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
