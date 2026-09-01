# Draft issue for github.com/altananetwork/altana-sdk

Not filed. Posting this is your call — it is public and under your name.

---

**Title:** `erc8183Addresses(97)` returns a stale OptimisticPolicy address — job registration reverts `0xc94463e3`

**Body:**

`@altananetwork/sdk@0.8.0` (current `latest`) returns an OptimisticPolicy
address for BSC testnet that the EvaluatorRouter rejects, so ERC-8183 job
registration — and therefore hiring — fails for every buyer on chain 97.

| Source | Policy address (chain 97) |
| --- | --- |
| `@altananetwork/sdk@0.8.0` | `0x4F4678D4439feC812Ac7674Bb3Efb4C8f5Fb78A6` |
| `@bnbagent/sdk@0.5.5` (`src/networks/addresses.ts`) | `0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA` |

Mainnet (chain 56) agrees between the two SDKs. Only chain 97 diverges.

**Symptom.** Registering a job against the SDK's address reverts `0xc94463e3`
on the EvaluatorRouter. Neither the SDK ABIs nor 4byte decode that selector.
`fund` then reverts `0x32d53d69`, which is the downstream effect rather than a
second bug — an unregistered job cannot be funded.

**Reproduce.**
1. `erc8183Addresses(97)` to get the policy address.
2. `registerJob` against it with any valid job.
3. Observe `0xc94463e3`.
4. Repeat with `0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA` — succeeds.

**What we ruled out first**, in case it saves someone the same afternoon:
insufficient funding, the documented jobId race, relay nonce artifacts, and a
platform outage. Each was eliminated by running the batch's five calls
individually before we thought to diff the address tables.

**Verified fix.** Job #864 registered and funded on chain 97 with the
`@bnbagent/sdk` address, after the SDK's own value had failed repeatedly.

Happy to open a PR against the chain-97 entry if that is useful.
