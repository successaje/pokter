# Pokter

**Choose what deserves your money.**

A decision layer for autonomous finance on BNB Chain. Pokter helps you discover,
verify, compare and safely hire autonomous financial agents — using onchain
activity, attestations, live execution data and scoped, revocable permissions.

Built for the BNB Chain *Smart Money Era* hackathon.

| | |
| --- | --- |
| **Live app** | https://pokter.fly.dev |
| **Demo video** | _<paste the link here>_ |
| **Submission** | [docs/submission.md](docs/submission.md) |

> The submission form has no field for a demo video, so this README is where it
> lives — please do not look for it elsewhere. The file is linked rather than
> committed: a screen recording would outweigh this entire repository many times
> over, and git keeps large blobs in history permanently even after deletion.

### What we found while building this

`@altananetwork/sdk@0.8.0` — still the published `latest` — ships a stale
ERC-8183 policy address for BSC testnet, so job registration reverts
`0xc94463e3` and hiring fails for **every buyer on chain 97**. We isolated it by
running the batch's five calls individually, ruled out funding, the documented
jobId race, relay nonce artifacts and a platform outage, then found the correct
address by diffing against the reference `@bnbagent/sdk`.

Reported upstream: [altananetwork/altana-sdk#84](https://github.com/altananetwork/altana-sdk/issues/84) ·
full trace in [docs/integrations/erc8183.md](docs/integrations/erc8183.md)

---

## The problem

The ERC-8004 registry on BSC holds **305,000+ agents**. Finding one is not the
hard part. Knowing which deserves your capital is.

An agent can have a polished description, a high reputation number and a
working endpoint, and still be a poor place to put money. Worse, much of the
registry is noise: bulk-minted clones sharing one description, agents whose
declared endpoint is dead, and top-ranked entries carrying zero attestations.

One agent we measured advertises Venus liquidation protection in convincing
technical detail, and has answered **none** of our probes.

## The approach

Three rules, enforced in code rather than asserted in copy.

**Every number traces to a source.** Performance figures come from on-chain
attestations indexed via 8004scan, decoded from their `feedback_uri` into the
measurer, methodology, probe counts and the measurer's own disclosed defects.
Each carries a provenance tag — `onchain`, `attested`, `Pokter measured`,
`estimated`, `historical` — that opens to the transaction behind it. Declared
facts and observed facts are never mixed.

**If we cannot verify it, we say so.** An agent with no attestations is marked
`Unproven` and blocked from hire rather than given a filler score. The Pokter
Score is computed only over dimensions that carry real data, and its coverage
travels with it — a 90 scored on three dimensions never passes for a 90 scored
on five. Returns and drawdown are reported as *not measured*, because nobody
publishes them and inferring them from uptime would be fabrication.

**We produce evidence, not just consume it.** Because so few agents carry
attestations, Pokter measures agents itself: scheduled sweeps probe declared
endpoints every two hours and accumulate a track record — **1,700+ probes** so
far — published in the same shape as third-party attestations, including the
defects our own method has.

## What works today

| Capability | Status |
| --- | --- |
| Agent discovery across four categories | Live against BSC mainnet |
| Hybrid retrieval (semantic + keyword + tags) | Working |
| Clone-farm collapse | Working |
| Evidence states and the Pokter Score | Working |
| Scheduled endpoint probing and track records | Working |
| Recommendations with checkable rejections | Working |
| Side-by-side comparison, up to four agents | Working |
| Rankings with per-metric awards | Working |
| Published methodology, imported from the code | Working |
| Altana scoped sessions — grant, register, revoke | **Verified on-chain** |
| ERC-8183 hiring — create, register, fund, escrow | **Verified on-chain** |
| Passkey wallets (WebAuthn, user-held) | Working |
| Agent delivery after funding | **Not working** — see below |
| Session grants signed by the visitor's wallet | **Not working** — see below |

## Evidence

Everything below is on BSC testnet and independently verifiable.

| What | Transaction |
| --- | --- |
| Altana session granted + registered in KeyStore | [`0x62a590ae…`](https://testnet.bscscan.com/tx/0x62a590ae974dd86ee0576c0ce2339afa97902430ac49fb4937de817a7f86019a) |
| Session revoked | [`0x9eaf149e…`](https://testnet.bscscan.com/tx/0x9eaf149e9e9cdd14e7fb192a699d8b62b1d06d3c7239b8e2f50eb8de12a9eae6) |
| ERC-8183 job hired end-to-end from the product | [`0x40b9fe98…`](https://testnet.bscscan.com/tx/0x40b9fe982b9af6542342c7cea3fbefeabb913e868aadbe15ca153de9ea9e87a8) |
| Escrow funded | [`0x711855b9…`](https://testnet.bscscan.com/tx/0x711855b98171278e47e51e891d454dc9ef1def728c58e837466ba20085cc7599) |

The same account in the **[Altana Keystore explorer](https://testnet.altana.network/account/0xAe4473468F10b507AB410077FA266FD8c5Af2196)** — one root
key active, three session keys expired or revoked. The lifecycle is the point:
sessions are issued scoped, and they end, either by expiry or because someone
revoked them.

**The permission scoping is enforced on-chain, not in our UI.** We granted two
sessions with deliberately different scopes and diffed the calldata: the
rebalancer grant carries the PancakeSwap Position Manager address; the
monitoring grant, whose allowlist is empty by design, does not. A call outside
the scope reverts inside the Altana account contract — Pokter could not weaken
it if it wanted to.

Sponsor integrations are documented with their evidence and their limits in
[`docs/integrations/`](docs/integrations/). The TermiX agent-versus-manual
comparison, including the task the agent lost, is in
[`docs/termix-agent-advantage.md`](docs/termix-agent-advantage.md) and on
[`/agent-advantage`](https://pokter.fly.dev/agent-advantage).

## Architecture

```
src/lib/
  scan/         8004scan client (server-only; API key never reaches the browser)
  agents/       classification into the four marketplace categories
  search/       hybrid retrieval and the filter grammar
  proof/        attestation decoding, verdicts, live endpoint probing
  history/      probe persistence, track records, scheduled sweeps
  score/        the Pokter Score, versioned and explainable
  recommend/    briefs, fit scoring, and why an agent was ruled out
  leaderboard   rankings and the per-metric awards
  altana/       scoped sessions: permissions, grant, revoke
  erc8183/      job escrow: hire, status, settle
  wallet/       passkey wallets and the signer in use
  hero/         the landing pipeline, built from real measurements
```

Eleven routes, no dead ends: `/`, `/discover`, `/agents`, `/agents/[chain]/[id]`,
`/categories/[category]`, `/compare`, `/leaderboard`, `/hire/[chain]/[id]`,
`/my-agents`, `/methodology`, `/agent-advantage`.

### Notes worth knowing

**Retrieval must be hybrid.** Semantic search alone returned generic trading
bots for grid strategies while thirteen agents with "Grid" in the name sat
unretrieved. Keyword search finds exactly those; the classifier filters both.

**Classification leans on declared tags**, since an agent tagged
`health-factor` is telling us its category outright. Separators are flattened so
`yield-optimizer.agent` matches `yield optimi`.

**The methodology page imports its thresholds** from the modules that enforce
them, so it cannot describe a rule the product does not follow.

**Missing data never satisfies a threshold.** An unmeasured agent fails
`has:probes>10` rather than passing it by absence, and is blocked from hire
rather than ranked last with a filler score.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:4311. No API key is required to browse.

```bash
npm run sweep
```

Runs one probe sweep and appends to the accumulated track record.

Environment (see `.env.example`): `SCAN_API_KEY` lifts the 8004scan rate limit
from 30 to 3,000 requests per minute, `SWEEP_SECRET` guards `POST /api/sweep`,
and `ALTANA_ADMIN_KEY` signs session grants and job escrow. **Use a testnet
key.**

## Deployment

Deployed on Fly.io with a persistent volume, and the volume is the point: the
three SQLite stores hold the accumulated probe history, granted sessions and
escrowed jobs. A marketplace whose evidence resets on every deploy is not one.

```bash
flyctl deploy --now
```

Sweeps run every two hours from a scheduled GitHub Actions workflow against the
deployed instance, so the track record keeps growing without a machine left
running locally.

## Honesty policy

If a feature cannot be proven, this codebase does not pretend it exists. If an
integration fails, it is documented with the exact error. If data is
unavailable, the interface says *not enough verified data*. If a transaction is
testnet, it says testnet.

Two of the five score dimensions — performance and risk — are permanently marked
*not measured*, and will stay that way until somebody publishes the data.

Pokter doesn't pretend to know what it can't know. We measure availability. We
verify attestations. We track evidence. We don't manufacture performance.

The credibility of the product is part of the product.
