# Pokter

**Choose what deserves your money.**

A decision layer for autonomous finance on BNB Chain. Pokter helps you discover,
verify, compare and safely hire autonomous financial agents — using onchain
activity, attestations, live execution data and scoped, revocable permissions.

Built for the BNB Chain *Smart Money Era* hackathon.

## The problem

The ERC-8004 registry on BSC holds **~296,000 agents**. Finding one is not the
hard part. Knowing which deserves your capital is.

An agent can have a polished description, a high reputation number and a
working endpoint, and still be a poor place to put money. Worse, much of the
registry is noise: bulk-minted clones sharing one description, agents whose
declared endpoint is dead, and top-ranked entries carrying zero attestations.

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
endpoints and accumulate a track record, published in the same shape as
third-party attestations, including the defects our own method has.

## What works today

| Capability | Status |
| --- | --- |
| Agent discovery across four categories | Live against BSC mainnet |
| Hybrid retrieval (semantic + keyword + tags) | Working |
| Clone-farm collapse | Working |
| Evidence states and the Pokter Score | Working |
| Scheduled endpoint probing and track records | Working |
| Recommendations with checkable rejections | Working |
| Altana scoped sessions — grant, register, revoke | **Verified on-chain** |
| ERC-8183 hiring — create, register, fund, escrow | **Verified on-chain** |

Sponsor integrations are documented with their evidence and their limits in
[`docs/integrations/`](docs/integrations/).

## Architecture

```
src/lib/
  scan/         8004scan client (server-only; API key never reaches the browser)
  agents/       classification into the four marketplace categories
  proof/        attestation decoding, verdicts, live endpoint probing
  history/      probe persistence, track records, scheduled sweeps
  score/        the Pokter Score, versioned and explainable
  recommend/    briefs, fit scoring, and why an agent was ruled out
  altana/       scoped sessions: permissions, grant, revoke
  erc8183/      job escrow: hire, status, settle
```

### Notes worth knowing

**Retrieval must be hybrid.** Semantic search alone returned generic trading
bots for grid strategies while thirteen agents with "Grid" in the name sat
unretrieved. Keyword search finds exactly those; the classifier filters both.

**Classification leans on declared tags**, since an agent tagged
`health-factor` is telling us its category outright. Separators are flattened so
`yield-optimizer.agent` matches `yield optimi`.

**The Altana SDK ships a stale testnet policy address.** We found it by diffing
against `@bnbagent/sdk` and override it for chain 97 only — see
[`docs/integrations/erc8183.md`](docs/integrations/erc8183.md).

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:4311. No API key is required to browse.

```bash
npm run sweep     # one probe sweep; appends to the accumulated track record
```

Environment (see `.env.example`): `SCAN_API_KEY` lifts the 8004scan rate limit,
`SWEEP_SECRET` guards `POST /api/sweep`, and `ALTANA_ADMIN_KEY` signs session
grants and job escrow. **Use a testnet key.**

## Honesty policy

If a feature cannot be proven, this codebase does not pretend it exists. If an
integration fails, it is documented with the exact error. If data is
unavailable, the interface says *not enough verified data*. If a transaction is
testnet, it says testnet.

The credibility of the product is part of the product.
