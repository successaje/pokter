# Shared interfaces: hire flow and ProofRun

Status: proposed by Agent 1 on 24 October 2026, open for Agent 2's changes.
Types live in `src/lib/shared/contracts.ts`. Both agents import from there
and change it only by agreement.

## Ownership

| Area | Owner | Paths |
| --- | --- | --- |
| Onboarding, buyer and provider MCP, hire routes, x402, final integration | Agent 1 | `src/app/api/mcp`, `src/lib/mcp`, `src/lib/assistant`, `src/app/api/hire/*`, onboarding pages, `src/lib/x402` |
| ProofRun verifier, replay format, fixtures, feature UI | Agent 2 | `src/lib/proofrun/*`, `tests/fixtures/proofrun/*`, ProofRun pages |
| The four shapes below | Both, by agreement | `src/lib/shared/contracts.ts` |

Neither agent resets, stashes or switches the other's checkout. A hook one
needs in the other's area is asked for, not edited in.

## The shapes

**PreparedBrief.** The exact task an agent is quoted and hired on, as
`prepare_hire` already writes it: the task text the price is signed over,
the skill, the brief contract, the compiler's statement and every input
value. It is an alias of the existing type, not a copy.

**JobRef / DeliveryRef.** `{ chainId, jobId }` for one escrow job. A delivery
adds the published URL, the hash committed on chain and `matchedBy`, the
existing `manifestMatch` result (`exact`, `sorted-keys`, `canonical`,
`sha256`), or null when the bytes did not match or were not read.

**AcceptanceSpec.** What a delivery must satisfy, stated before funding.
Optional: most jobs have none. `kind` names a checker, and only kinds with a
checker may be offered to a buyer.

**VerificationResult.** A verifier's answer: `verified`, `mismatch`,
`unverifiable`, `pending` or `error`, with the method, per-field details,
evidence, limitations and an optional replay reference. It maps onto the
Venus report check's existing verdict: `matches` → `verified`, `differs` →
`mismatch`, `unverified` → `unverifiable`.

## Rules both sides keep

- A timeout, an unknown or an unsupported case is never `verified`.
- `provenance` (`fixture`, `simulation`, `sponsored`, `customer`) travels with
  every result, so fixtures and sponsored tests are never counted as customer
  work.
- The hash match is a precondition, not the verification: a delivery whose
  bytes do not match what the agent committed is `mismatch` before any field
  is recomputed.
