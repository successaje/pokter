# Shared interfaces: hire flow and ProofRun

Status: agreed by Agent 1 and Agent 2 on 24 October 2026.
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

**AcceptanceSpec.** What a delivery must satisfy, stated before funding:
criteria (each with a stable id, a label and a machine check), a `specHash`
(keccak256 of `canonicalJson(criteria)`), the subject with its deployment
named, versions, and a **binding**. Optional: most jobs have none.

The binding is the honest part. The agent's quote signature already covers
`terms.success_criteria` (`negotiationContent`, a port of the reference SDK).
So when Pokter sends the spec hash in `success_criteria` and the agent's
signed terms carry it back with `negotiationTermsBound()` true, the criteria
are **agreed** (`signed-terms`). Otherwise they are **recorded by Pokter**
(`pokter-asserted`) and shown that way. No envelope field is added: an
anchored job description is the anchor alone, so a new field would be dropped
for exactly the sellers that hash it.

**VerificationResult.** A summary state (`verified`, `mismatch`,
`unverifiable`, `pending`, `error`, `contradicted`) over per-check results.
A buyer sees exactly three outcomes per check: Passed, Failed, Not verified;
why a check is not verified stays in its `limitation`. `contradicted` is
verifiers disagreeing: unresolved, never passed.

## Hooks between the two

- **Quote path (Agent 1).** `requestQuote` and `/api/hire/quote` accept
  `successCriteria: string[]`, sent inside the negotiated terms. ProofRun
  supplies the strings from a spec; the hire flow never invents criteria.
- **Review panel (Agent 2 renders, Agent 1 mounts).** The brief review screen
  mounts ProofRun's "What Pokter will check" panel, passing the prepared
  brief and the spec when there is one, and nothing when there is not.
- **Hashing.** `canonicalJson` from `erc8183/negotiation` is the only
  canonical serialiser.

## Rules both sides keep

- A timeout, an unknown or an unsupported case is never `verified`.
- `provenance` (`fixture`, `simulation`, `sponsored`, `customer`) travels with
  every result, so fixtures and sponsored tests are never counted as customer
  work.
- The hash match is a precondition, not the verification: a delivery whose
  bytes do not match what the agent committed is `mismatch` before any field
  is recomputed.
