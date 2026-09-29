# Pokter

**Choose what deserves your money.**

A decision layer for autonomous finance on BNB Chain. Pokter helps you discover,
verify, compare and safely hire autonomous financial agents — using onchain
activity, attestations, live execution data and buyer-controlled escrow.

|                   |                              |
| ----------------- | ---------------------------- |
| **Live app**      | https://pokter.xyz           |
| **X**             | https://x.com/usepokter      |
| **Walkthrough**   | https://youtu.be/KyuKia6RL9s |

> The walkthrough is linked rather than committed: a screen recording would
> outweigh this entire repository many times over, and git keeps large blobs in
> history permanently even after deletion.

### A bug we found in a dependency, and how it ended

Hiring failed against `@altananetwork/sdk@0.8.0` with `0xc94463e3`, a selector
neither the SDK ABIs nor 4byte could decode. We isolated it by running the
batch's five calls individually, ruled out funding, the documented jobId race,
relay nonce artifacts and a platform outage, then found it by diffing the
address tables of two SDKs: the ERC-8183 policy address for BSC testnet was
stale. We pinned the correct value and reported it upstream.

**The maintainers had already fixed it.** Released in
[`0.9.0`](https://www.npmjs.com/package/@altananetwork/sdk/v/0.9.0) on 2
September 2026, a day after we hit it, and our report was closed as a duplicate
of [#53](https://github.com/altananetwork/altana-sdk/issues/53). We had checked
that 0.8.0 was `latest` when we filed; it had stopped being `latest` by the time
anyone read it.

So we upgraded to 0.9.0 and our workaround is now inert — `hasPolicyOverride`
compares against the SDK at runtime and reports false, because nothing diverges
any more. Verified independently: on the testnet router, `policyWhitelist`
returns `false` for the old address and `true` for the new one, and
`0xc94463e3` is `PolicyNotWhitelisted()`.

The diagnosis was right and the conclusion was out of date. Both are recorded
here, because a project that argues numbers should carry their provenance does
not get to quietly delete the one it got wrong.

**Two findings from the same investigation are still open**, each verified
against `0.9.0` and checked against every existing issue before filing:

- [**#87**](https://github.com/altananetwork/altana-sdk/issues/87) — the
  exported ABIs carry 40 function fragments and **zero** error fragments, so no
  custom error from any of these contracts is decodable by viem or ethers. That
  is the real reason `0xc94463e3` cost an afternoon, and it applies to every
  revert path rather than one address. The reporter of
  [#81](https://github.com/altananetwork/altana-sdk/issues/81) had to
  keccak-verify the same selector by hand.
- [**#88**](https://github.com/altananetwork/altana-sdk/issues/88) —
  `package.json` declares `main` while `exports` has no `require` condition, so
  `require('@altananetwork/sdk')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED` against
  a package that appears to advertise CJS support.

We offered to PR both. A third candidate — browser-wallet signing — we did not
file: it is already tracked in
[#63](https://github.com/altananetwork/altana-sdk/issues/63), which explains it
better than we could. An Altana wallet is an EIP-7702 account, so the admin
authority needs signatures extension wallets deliberately withhold.

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
`Unproven` rather than given a filler score. Unproven agents cannot be hired
without explicitly accepting the risk. The Pokter Score is computed only over
dimensions that carry real data, and its coverage travels with it — a 90 scored
on three dimensions never passes for a 90 scored on five. Returns and drawdown
are reported as _not measured_, because nobody publishes them and inferring
them from uptime would be fabrication.

**We produce evidence, not just consume it.** Because so few agents carry
attestations, Pokter measures agents itself: scheduled sweeps probe declared
endpoints every two hours and accumulate a track record — **15,500+ probes**
across 144 sweeps so far — published in the same shape as third-party
attestations, including the defects our own method has.

**We do not count ourselves as independent.** Our own sweep runs through the
same verdict logic as a third-party attestation, so that first- and
third-party evidence are judged by one standard. It carries no transaction
hash, and nothing that claims independence counts it. This matters more than
it sounds: the evidence tiers below are decided on independent measurers
alone, and by that standard **no agent on BNB Chain is currently Proven** —
every candidate has exactly one independent measurer. We would rather publish
an empty top tier than award ourselves the corroboration.

**A price is evidence too.** No registry field or agent card publishes what an
agent charges — a price exists only inside a quote the agent signs when asked.
Sweeps ask, verify that the signature recovers to the agent's registered
ERC-8004 wallet, and store the result; an unsigned price, or one signed by
whoever answered the socket, is discarded. Listings show what each agent
actually quoted, and say plainly when an agent would not name a price rather
than substituting a default and calling it one.

### The evidence tiers

| Tier         | What it means                                                                 |
| ------------ | ----------------------------------------------------------------------------- |
| **Proven**   | Two independent measurers agree, over enough probes and a long enough window. Pokter is never one of them. |
| **Emerging** | Real measured evidence, short of the independence bar. Today this is where the corroborated agents sit. |
| **Unproven** | Nothing has been measured. Hiring requires explicitly accepting the risk.      |
| **Failing**  | Measured, and failing its own measurers. Pokter does not recommend hiring it.  |

An agent's tier is computed, never assigned. The page states which measurers
counted and which published attestations could not be scored, so a tier can
always be checked against the evidence that produced it.

## What works today

| Capability                                       | Status                                          |
| ------------------------------------------------ | ----------------------------------------------- |
| Agent discovery across four categories           | Live against BSC mainnet                        |
| Hybrid retrieval (semantic + keyword + tags)     | Working                                         |
| Clone-farm collapse                              | Working                                         |
| Evidence states and the Pokter Score             | Working                                         |
| Scheduled endpoint probing and track records     | Working                                         |
| Recommendations with checkable rejections        | Working                                         |
| Side-by-side comparison, up to four agents       | Working                                         |
| Agent-signed price quotes, captured on sweep     | Working                                         |
| Rankings with per-metric awards                  | Working                                         |
| Published methodology, imported from the code    | Working                                         |
| Historical Altana session grant and revocation  | **Verified on-chain; new grants disabled**      |
| ERC-8183 hiring — create, register, fund, escrow | **Verified on-chain**                           |
| Passkey wallets (WebAuthn, user-held)            | Working                                         |
| Standing delegated wallet authority              | **Disabled until calldata constraints exist**   |
| Agent delivery and receipt verification          | **Verified end to end on-chain**                |
| Performance and risk scoring                     | **Never** — [why](#what-does-not-work)          |

## Evidence

Everything below is on BSC testnet and independently verifiable. Session
transactions are historical evidence of the integration; Pokter no longer
creates new delegated sessions from the product.

| What                                            | Transaction                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Altana session granted + registered in KeyStore | [`0x62a590ae…`](https://testnet.bscscan.com/tx/0x62a590ae974dd86ee0576c0ce2339afa97902430ac49fb4937de817a7f86019a) |
| Session revoked                                 | [`0x9eaf149e…`](https://testnet.bscscan.com/tx/0x9eaf149e9e9cdd14e7fb192a699d8b62b1d06d3c7239b8e2f50eb8de12a9eae6) |
| ERC-8183 job hired end-to-end from the product  | [`0x40b9fe98…`](https://testnet.bscscan.com/tx/0x40b9fe982b9af6542342c7cea3fbefeabb913e868aadbe15ca153de9ea9e87a8) |
| Escrow funded                                   | [`0x711855b9…`](https://testnet.bscscan.com/tx/0x711855b98171278e47e51e891d454dc9ef1def728c58e837466ba20085cc7599) |
| Live session granted from the product           | [`0x62b049db…`](https://testnet.bscscan.com/tx/0x62b049db108673c41bbe8a9d9cebbdffb1e06451db3ba2db31c88a035a1233bd) |
| Live job hired and escrowed                     | [`0x93385d57…`](https://testnet.bscscan.com/tx/0x93385d5708964b0b6257b24b38ee00149fc53112445030d7227d43a6d90f9ac5) |
| Public receipt submitted for live job #1336     | [`0x775ced53…`](https://testnet.bscscan.com/tx/0x775ced536b513df298464d76284ad133af4c5b3cd465213ed7ebb3f63bcc3d50) |
| Buyer verified and settled live job #1336       | [`0xcecbf3fc…`](https://testnet.bscscan.com/tx/0xcecbf3fc43ba3edd609230b855cc6e1a4548b911bf5cd1177a263620e889dc33) |

Both operator accounts are visible in the **Altana Keystore explorer**, and
between them they show the whole lifecycle:

- **[Live now](https://testnet.altana.network/account/0x60eF148485C2a5119fa52CA13c52E9fd98F28e87)** — a root key and a session key, both active, the session
  granted from the product itself.
- **[Ended](https://testnet.altana.network/account/0xAe4473468F10b507AB410077FA266FD8c5Af2196)** — one root key active, three session keys expired or
  revoked.

These transactions prove that sessions expire and can be revoked. They do not
prove that the old target-and-selector policy was safe for financial execution.

### The allowlist was tested — and its limit changed the product

Saying "a call outside the allowlist reverts" is worth nothing unless somebody
tries it. [`scripts/prove-enforcement.mts`](scripts/prove-enforcement.mts)
grants a session scoped to a single contract and then makes two calls through
it — identical calldata, zero value, only the target differs:

| Call         | Target                   | Result                                                                              |
| ------------ | ------------------------ | ----------------------------------------------------------------------------------- |
| In scope     | PancakeSwap V3 Router    | **Accepted** — [`0x6e8cb539…`](https://testnet.bscscan.com/tx/0x6e8cb539c9c3cef423) |
| Out of scope | an address never granted | **Rejected** — `UnauthorizedCall`                                                   |

The rejection comes from the Altana account contract's validator, not from
Pokter. The session, the calldata and the signer were the same in both cases.

The script refuses to call it a pass unless the in-scope call actually
succeeded. An earlier run had both calls fail on a type error in the caller,
which would have read as the allowlist working while proving nothing — the
same mistake this product exists to prevent, so the test now has to distinguish
the two failure modes.

The test proves that target and function restrictions are enforced on-chain.
It also exposed why that is not enough: PancakeSwap swap, mint and collect
calls carry recipient, asset, position and amount fields inside calldata. The
current Altana permission schema cannot constrain those arguments. A permitted
selector could therefore route proceeds to an address the user never approved.

Pokter now fails closed at three layers: the hire UI states that no standing
authority is created, the grant route refuses before reading grant parameters
or touching a signer — `403` to the public, since granting was always an
operator-funded demo action, and `409` even when that check passes — and
`toSessionPermissions` refuses every marketplace category. `npm run
audit:protocol` checks all four categories so a raw protocol selector cannot be
reintroduced as an incidental refactor.

Delegation will remain disabled until an audited adapter or account validator
can enforce the wallet as recipient, explicit asset and position allowlists,
per-call amount bounds, aggregate spend bounds, expiry and revocation. The
acceptance test is adversarial: an otherwise identical call with an attacker
recipient, unapproved asset, unapproved position or excessive amount must
revert on-chain.

Sponsor integrations are documented with their evidence and their limits in
[`docs/integrations/`](docs/integrations/). The TermiX agent-versus-manual
comparison, including the task the agent lost, is in
[`docs/termix-agent-advantage.md`](docs/termix-agent-advantage.md) and on
[`/agent-advantage`](https://pokter.xyz/agent-advantage).

## For PancakeSwap liquidity providers

`/pool-check` answers a question an LP has before delegating a
concentrated-liquidity position: **will this agent pay for itself?**

It reads the V3 pool live — fee tier, current tick, and the liquidity actually
sitting at that tick — and prices what running an agent would cost: pool fees,
price impact against real liquidity, gas, and the agent's own per-job fee. The
output is a **break-even**: the improvement in fee capture the agent must deliver
before hiring it leaves the LP better off.

The asymmetry is the point. The cost is computable, so it is computed exactly.
The benefit is not — no agent publishes realised returns, and nothing on-chain
attributes fee capture to a rebalance decision — so it is not guessed. A
break-even is the honest form of the question, and unlike a forecast it is
something an LP can hold an agent to after a month.

The same agent on a $25,000 position rebalancing eight times a month needs
**1.70%** on WBNB/USDT and **9.20%** on CAKE/WBNB: a thinner pool and a five-times
wider fee tier change the answer completely, which is exactly what an LP needs to
know before delegating.

## What does not work

Four things, stated here rather than discovered.

**Third-party delivery is only as reliable as the seller endpoint.** The
original test seller has no discoverable runtime, so its historical jobs remain
at `FUNDED`. Pokter now includes a same-chain A2A seller for the guided path: it
verifies the funded job, serves a canonical manifest and submits its hash
through ERC-8183. Live job #1336 proves the full path with a publicly
retrievable receipt whose exact bytes match the hash committed on-chain, plus
a buyer-signed settlement that advanced the job to `COMPLETED`.

**Delegated wallet execution is disabled.** The SDK can restrict a session to
a target and function selector, but not the safety-critical arguments inside
that function. This affects passkeys and browser wallets equally; changing the
signer does not improve the policy. Pokter commissions one escrowed job without
creating standing authority over the buyer's wallet.

**Session signers do not survive a restart.** Granting produces an ephemeral
key held in process memory, and SDK 0.9.0 warns that losing it makes the
authorization unusable. It does not bite here — Pokter never acts as an agent,
and revocation targets the registered public key, so a restart cannot strand a
live permission. It would matter the day Pokter executes on a user's behalf,
and at that point the key needs real secret storage rather than a Map.

**Performance and risk are never scored.** Not a gap we intend to close — no
agent publishes realised returns, and nothing on-chain attributes profit or
loss to a specific agent's decision. Both dimensions read _not measured_
permanently, and the Pokter Score rescales across what is left rather than
quietly filling them in.

Each is written up with the exact error in
[`docs/integrations/`](docs/integrations/).

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
  altana/       historical sessions, revocation, fail-closed delegation policy
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
`has:probes>10` rather than passing it by absence, and sorts last on an absent
score rather than a filler one. Hiring it requires explicitly accepting the risk.

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
and `ALTANA_ADMIN_KEY` signs controlled testnet demo transactions. Set
`POKTER_DEMO_WRITE_SECRET` to a strong server-side value before using those
operator routes from a trusted script; they fail closed when it is absent and
the browser UI never receives it. **Use a testnet key.**

## Deployment

Deployed on Fly.io with a persistent volume, and the volume is the point: the
SQLite stores hold accumulated probe history, historical sessions, escrowed
jobs, deliverables and rate-limit state. A marketplace whose evidence resets on
every deploy is not one.

```bash
flyctl deploy --now
```

Sweeps run every two hours from a scheduled GitHub Actions workflow against the
deployed instance, so the track record keeps growing without a machine left
running locally.

## Honesty policy

If a feature cannot be proven, this codebase does not pretend it exists. If an
integration fails, it is documented with the exact error. If data is
unavailable, the interface says _not enough verified data_. If a transaction is
testnet, it says testnet.

Two of the five score dimensions — performance and risk — are permanently marked
_not measured_, and will stay that way until somebody publishes the data.

Pokter doesn't pretend to know what it can't know. We measure availability. We
verify attestations. We track evidence. We don't manufacture performance.

The credibility of the product is part of the product.
