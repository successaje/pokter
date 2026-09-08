# Submission form — paste-ready copy

Refresh the probe count before submitting: it grows every two hours.
Current figures live at https://pokter.fly.dev

---

## PROJECT DESCRIPTION — 800 character limit

> In 800 characters or less, describe how your marketplace vision is
> unique and what features you have optimized for.

(739 characters)

Most marketplaces rank agents by what they claim. Pokter ranks by what has been observed, and refuses to rank what it cannot verify.

The BNB registry holds 306K agents, and its top-scored ones carry zero attestations. So we separate declared facts from measured ones: attestations decoded from chain to the measurer behind each figure, and agents nobody has checked probed by us on a schedule.

Optimised for provenance — every number links to its source; honest absence — two of five score dimensions permanently read "not measured", because nobody publishes returns; and scoped delegation — an allowlist, spend cap and expiry, enforced on-chain and revocable.

Unproven agents are blocked from hire, not ranked last with a filler score.

---

## ADDITIONAL NOTES

**Live:** https://pokter.fly.dev
**Source:** https://github.com/successaje/pokter
**Demo video:** https://youtu.be/KyuKia6RL9s (5:33)

**On-chain evidence (BSC testnet, all verifiable):**
- Altana session granted + registered in KeyStore: `0x62a590ae974dd86ee0576c0ce2339afa97902430ac49fb4937de817a7f86019a`
- Session revoked: `0x9eaf149e9e9cdd14e7fb192a699d8b62b1d06d3c7239b8e2f50eb8de12a9eae6`
- ERC-8183 job hired end-to-end from the product: `0x40b9fe982b9af6542342c7cea3fbefeabb913e868aadbe15ca153de9ea9e87a8`
- Escrow funded: `0x711855b98171278e47e51e891d454dc9ef1def728c58e837466ba20085cc7599`
- Live session granted from the product: `0x62b049db108673c41bbe8a9d9cebbdffb1e06451db3ba2db31c88a035a1233bd`
- Live job hired and escrowed: `0x93385d5708964b0b6257b24b38ee00149fc53112445030d7227d43a6d90f9ac5`
- Altana Keystore explorer, root and session key both active right now:
  https://testnet.altana.network/account/0x60eF148485C2a5119fa52CA13c52E9fd98F28e87
- Altana Keystore explorer, the earlier account, showing three session keys
  expired or revoked — sessions end, which is the point:
  https://testnet.altana.network/account/0xAe4473468F10b507AB410077FA266FD8c5Af2196

**The permission scoping is enforced on-chain, not in our UI.** We granted two
sessions with deliberately different scopes and diffed the calldata: the
rebalancer grant carries the PancakeSwap Position Manager address, and the
monitoring grant — whose allowlist is empty by design — does not. Calls outside
the scope revert inside the Altana account contract.

**A bug we found, reported, and were beaten to.** ERC-8183 hiring failed on
`@altananetwork/sdk@0.8.0` with `0xc94463e3` — a selector nothing could decode.
We isolated it by running the batch's five calls individually, ruled out
funding, the documented jobId race, relay nonce artifacts and a platform
outage, then found it by diffing two SDKs' address tables: the testnet policy
address was stale. We pinned the correct one and filed upstream.

The maintainers had already fixed it, in 0.9.0, released the day after we hit
it; our report was closed as a duplicate. We have upgraded, and our workaround
is now inert by design — it compares against the SDK at runtime and reports no
divergence. Independently verified on the testnet router: `policyWhitelist` is
`false` for the old address and `true` for the new, and `0xc94463e3` decodes to
`PolicyNotWhitelisted()`.

We are including this having got the conclusion wrong rather than despite it.
The debugging was sound; the claim that it was still broken was not, and the
correction is in the README and on the site.

**For PancakeSwap LPs, a tool rather than an integration.** `/pool-check` reads
a live V3 pool — fee tier, current tick, and the liquidity actually sitting at
that tick — and prices what running an agent costs on a position: pool fees,
price impact against real liquidity, gas, and the agent's own fee. It reports a
**break-even**: the improvement in fee capture the agent must deliver before
hiring it leaves the LP better off. The cost is computed exactly because it can
be; the benefit is refused because no agent publishes returns and nothing
on-chain attributes fee capture to a rebalance. On a $25,000 position
rebalancing eight times a month, the same agent must earn 1.70% on WBNB/USDT and
9.20% on CAKE/WBNB — the difference that decides whether delegating is sensible
at all.

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
- The visitor's browser wallet does not sign session grants. The SDK ships no
  injected-wallet signer: 0.8.0 carried a doc comment naming
  `signerFromInjected` that was never implemented, 0.9.0 removed the comment,
  and the gap remains. Browser wallets also no longer expose the raw digest
  `Signer.signDigest` needs. We
  built the WebAuthn passkey path, which does give real custody, and the
  interface always states which key signed.
- Performance and risk are never scored, because nobody publishes the data.

Each integration is written up in docs/integrations/ with the exact error it
produced and the fix where there was one. A submission listing only successes
is a claim; one naming its failures is a report.

**Sessions and escrow run on BSC testnet, and every surface showing one says so.**
