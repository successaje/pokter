# Draft issue — exported ABIs carry no error fragments

Not filed. Verified against `@altananetwork/sdk@0.9.0` (current `latest`).
Checked against every open and closed issue in the repo — nobody has raised
this. #84 and #81 both mention an undecodable selector as a *symptom*; #72 is
the relay layer, not contract ABIs.

---

**Title:** Exported ABIs contain no `error` fragments, so every revert decodes as raw hex

**Body:**

The ABIs the SDK exports contain function fragments but no error fragments, so
`viem` and `ethers` cannot decode any custom error these contracts raise. Every
failed call surfaces as an opaque selector.

Counted across `dist` in 0.9.0:

| Fragment type | Count |
| --- | --- |
| `function` | 40 |
| `error` | **0** |

**Why it matters.** A revert currently gives you a 4-byte selector and nothing
else. 4byte does not have these signatures either, so there is no fallback. In
practice that turns a one-line diagnosis into an afternoon of elimination —
running each call in a batch individually to find which one failed, then
guessing at causes.

Concretely: `0xc94463e3` from the EvaluatorRouter is `PolicyNotWhitelisted()`.
I could not determine that from the SDK, and only learned it when a maintainer
said so in #84. With the error fragments present, `viem` would have named it on
the first failed call.

**Reproduce.**

```js
import { erc8183Addresses } from '@altananetwork/sdk';
// Any revert from these contracts:
//   viem → ContractFunctionExecutionError with `signature: '0xc94463e3'`
//   and no `errorName`, because the ABI has nothing to match against.
```

**Suggested fix.** Include the `error` entries from each contract's compiled ABI
in the exported ones. It is additive, costs nothing at runtime, and applies to
every revert path rather than any single bug.

**Related, but not the same.** #84 and #81 both hit an undecodable selector as
a symptom of the policy-address bug — in #81 the reporter had to keccak-verify
`PolicyNotWhitelisted()` by hand to identify it. That is two people
independently doing manual selector recovery for an error the ABI could have
named. #72 covers opaque *relay* errors, which is a separate layer.

Happy to open a PR if useful — I would follow CONTRIBUTING.md and verify by
simulating a call against a non-whitelisted policy on chain 97, checking that
`PolicyNotWhitelisted` comes back by name rather than as hex.
