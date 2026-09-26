# Protocol architecture audit

**Scope.** Pokter's trust model end to end: ERC-8004 identity, discovery and
evidence, Altana session authority, ERC-8183 hiring, A2A delivery,
verification, dispute and settlement, persistence, and campaign attribution.

**Method.** Source review of every authority- or value-bearing path, comparison
against the existing mainnet-readiness register, and static verification with
ESLint. This is an application/protocol-integration review, not an audit of the
third-party Altana or ERC-8183 contract bytecode.

**Date:** 26 September 2026  
**Disposition:** **Not ready for mainnet delegation.** Testnet demonstration is
credible, but the current product does not yet constitute a trust-minimised
marketplace between a named ERC-8004 agent and a buyer.

---

## Executive conclusion

Pokter has real strengths: buyers sign their own escrow transactions, receipt
bytes are checked against an on-chain commitment, arbitrary outbound URLs are
SSRF-screened and DNS-pinned, operator write routes are protected, and the UI
does not invent performance data.

The remaining problems sit one layer deeper than UI polish:

1. the permission rules constrain contract and function, but not dangerous
   function arguments;
2. a session is not bound or delivered to the named agent;
3. a hire is not cryptographically attributable to the ERC-8004 listing from
   which it began;
4. the buyer cannot initiate the protocol's dispute path in the product; and
5. funded jobs are indexed only in one browser's local storage.

Until those are fixed, Pokter should describe the live path as an **escrow and
delivery demonstration**, not autonomous financial delegation.

---

## Findings

### POK-023 · Allowed methods can transfer value to an arbitrary recipient

**Severity: Critical · Status: Contained, redesign open · Mainnet blocker**

`src/lib/altana/contracts.ts` permits PancakeSwap calls by target and function
signature. Several permitted functions contain a caller-controlled recipient:

- `exactInputSingle(... recipient ...)` can route swap output elsewhere;
- `collect(... recipient ...)` can route LP fees elsewhere; and
- `mint(... recipient ...)` can mint the position NFT elsewhere.

The UI nevertheless says the agent cannot transfer tokens to an arbitrary
address. Selector-level enforcement does not prove that claim. A native-BNB
spend cap also does not establish a cap on ERC-20 value or fee proceeds.

**Required remediation.** Do not grant these raw calls until enforcement can
constrain recipients to the user's account and constrain token IDs/assets.
Use a purpose-built policy/adapter contract that validates calldata, or an
account validator with argument rules. Add adversarial tests for attacker
recipients and for ERC-20 value exceeding the displayed cap.

**Acceptance test.** The same valid operation succeeds with recipient equal to
the user's account and reverts on-chain when only the recipient is changed to
an attacker. Repeat for swap, collect and mint.

**Containment.** `toSessionPermissions` now refuses every category carrying
write calls, and the hire UI creates no standing wallet permission. The
mainnet blocker remains until argument-aware enforcement passes the acceptance
test above; disabling exposure is not the final protocol design.

### POK-024 · “Authorize agent” creates a session the agent cannot use

**Severity: High · Status: Open · Product-claim blocker**

`PermissionReview` calls `grantSession`, stores only the returned public key,
and never transmits session signing capability to the selected agent. The
session is also not cryptographically bound to the ERC-8004 token ID or its
owner/runtime. The current flow proves that a scoped key can be registered and
revoked; it does not delegate execution to the chosen agent.

**Required remediation.** Define an explicit capability handoff protocol. Bind
the grant to chain ID, ERC-8004 token ID, current owner/provider, intended
runtime, permissions, nonce and expiry. Encrypt capability material to an
agent-advertised key or use a protocol where the agent supplies the session
public key before the buyer grants it. Never expose a reusable private key to
Pokter's server.

**Acceptance test.** The selected agent executes an allowed call with its own
session key; a different agent cannot; changing the registry token/provider
invalidates or prevents the handoff; revocation stops the original agent.

### POK-025 · ERC-8183 jobs do not commit to the selected ERC-8004 agent

**Severity: High · Status: Partially fixed, historical jobs remain unattributed**

The on-chain hire records a provider, description and budget. The ERC-8004
token ID and marketplace category are written only to browser-local metadata.
On testnet, the buyer may deliberately choose a shared Pokter delivery seller
instead of the listing's wallet. A completed job therefore proves that the
provider completed a job, not that the selected marketplace agent did so.

This prevents reliable per-agent rankings, quest accounting, ratings and
claims about organic marketplace adoption.

**Required remediation.** Commit a canonical job envelope (or its hash) in the
ERC-8183 description/manifest containing identity chain, ERC-8004 token ID,
registry address, provider address, category, buyer, nonce and terms. Require
the provider to equal the current registry-authorised wallet, or clearly model
Pokter as a separate fulfilment provider rather than attributing its work to
the listing.

**Acceptance test.** Starting from a listing produces an independently
verifiable chain from ERC-8004 identity to provider to ERC-8183 job to signed
delivery and settlement, with no Pokter database required.

**Fix for new jobs.** Pokter now encodes a versioned canonical envelope in the
immutable ERC-8183 description. It records the ERC-8004 identity chain and
token ID, category, actual fulfilment provider and original task separately.
This prevents a shared provider's work from being silently presented as work
performed by the selected listing. Historical jobs cannot be retroactively
repaired, and provider-to-registry authorization still needs the capability
binding described in POK-024.

### POK-026 · The buyer has no dispute action in the production job UI

**Severity: High · Status: Fixed in code, chain verification pending**

The server helper supports `approve | dispute`, but the buyer-owned client
flow and `JobCard` expose only refresh and approve. A buyer can withhold
approval but cannot invoke the arbitration path from Pokter during the dispute
window. The product therefore exposes the payment path without the matching
remedy.

**Required remediation.** Add a first-class dispute action while the window is
open, showing deadline, consequence, evidence payload and transaction result.
Do not bury it behind an error state. Confirm the evaluator/policy's actual
post-expiry behavior and communicate it before funding.

**Acceptance test.** Submit an invalid testnet deliverable, dispute it from the
buyer UI before the deadline, verify the on-chain state transition, then prove
approval is unavailable or behaves according to policy.

**Code fix.** `JobCard` now presents a separately confirmed “Contest delivery”
action and signs the SDK's `action: 'dispute'` path with the buyer's passkey.
This finding is not fully closed until the acceptance test is executed on
testnet.

### POK-027 · Clearing one browser can orphan Pokter's view of funded jobs

**Severity: High · Status: Open · Recovery blocker**

Buyer jobs and their ERC-8004 attribution are stored only in local storage.
There is no chain-derived “my jobs” index. A cleared profile, new device or
lost local record removes the UI route to review, dispute and settle funds,
even though the job remains on-chain.

**Required remediation.** Reconstruct jobs from indexed `JobCreated` events by
connected buyer address, then read authoritative fields from the contract.
Treat local storage as a cache only. Provide import-by-job-ID as a fallback.

**Acceptance test.** Fund a job, clear all Pokter site data, recover the passkey
on a supported device/profile, and still discover, review, dispute or settle
the job without manually editing storage.

### POK-028 · Authorization and hiring are independent ceremonies

**Severity: Medium · Status: Open**

The page presents permission grant and commission as two grants “in the order
they matter,” but commissioning neither consumes nor references the session.
A user can fund escrow without authorizing; authorizing does not change what
the seller can do. The protocol currently has two parallel demos rather than a
single delegated-work lifecycle.

**Required remediation.** Decide between two explicit products: paid analysis
that requires no wallet authority, or delegated execution where the job commits
to a particular capability. Gate and label each independently.

### POK-029 · Receipt verification proves integrity, not satisfactory work

**Severity: Medium · Status: Open**

The verifier correctly proves that fetched bytes match the submitted on-chain
hash. It does not validate that the manifest belongs to the expected agent,
satisfies the task, contains authentic execution evidence, or produced an
acceptable economic result. The UI asks the buyer to review, which is good,
but “verified receipt” can be read more broadly than the actual guarantee.

**Required remediation.** Rename the result to “bytes match on-chain
commitment.” Validate the canonical envelope from POK-025 and, for execution
jobs, require chain-specific transaction references whose sender, target and
effects are independently checked.

### POK-030 · Mainnet can still display a testnet gas denomination

**Severity: High · Status: Fixed**

`JobCard` tells an underfunded buyer that the wallet needs `0.002 tBNB` even
when `WALLET_NETWORK` is mainnet. This is the same real-money/test-money
confusion previously closed as POK-003, in a settlement error path that was
missed.

**Required remediation.** Use the network presentation module here and add a
repository check/test forbidding literal `tBNB` outside the presentation
definition and testnet-only copy.

**Fix.** Settlement and dispute funding errors now use `NATIVE_SYMBOL` from the
shared network presentation module.

### POK-031 · Rate-limit identity and updates are not robust under concurrency

**Severity: Medium · Status: Open**

The limiter trusts forwarding headers as the caller identity and performs a
separate read followed by update. Correctness therefore depends on the edge
proxy stripping user-supplied headers, and concurrent requests can pass from
the same old count. Limits also remain per machine.

**Required remediation.** Document and test Fly's trusted proxy behavior,
derive IP only from the platform-trusted header, and use an atomic SQLite
upsert/transaction or a shared atomic store before scaling horizontally.

### POK-032 · A new Undici agent is created per outbound endpoint check

**Severity: Medium · Status: Open**

`assertPublicEndpoint` creates a new `undici.Agent` for every call and does not
close it. Public trial, notification and receipt-verification routes can cause
connection-pool/resource accumulation even when request count is limited.

**Required remediation.** Close the dispatcher in `finally`, or use a bounded
cache with eviction and explicit close behavior. Load-test repeated failures as
well as successful requests.

### POK-033 · Passkey recovery is a protocol dependency without a proven path

**Severity: Medium · Status: Open**

The account is the ERC-8183 client and the only party able to approve/dispute.
The existing audit already marks second-device recovery untested. That is not
merely login UX: it is recovery authority over escrowed funds.

**Required remediation.** Exercise platform-synced recovery, non-synced
credential loss, RP-ID migration and fallback recovery. Publish what happens
to active jobs in each case. Do not claim recoverability beyond the tested
authenticator class.

---

## Trust-boundary assessment

| Boundary | Current source of truth | Assessment |
| --- | --- | --- |
| Agent identity | ERC-8004 registry / 8004scan index | Useful for discovery; not committed into hires |
| Agent quality | attestations + Pokter probes | Transparently limited; liveness is not correctness |
| Buyer authority | passkey-controlled Altana account | Strong custody model; recovery still unproven |
| Agent authority | Altana session rule set | On-chain enforcement works, but calldata scope is unsafe and capability is not handed to the agent |
| Payment | ERC-8183 escrow | Real and buyer-signed |
| Delivery | provider submission + URL/hash | Integrity proven; identity and semantic correctness incomplete |
| Settlement | buyer signature + policy | Approval works; dispute UX absent |
| Product history | browser local storage | Not authoritative or recoverable |

---

## Required order of work

1. **Freeze mainnet session grants** until POK-023 is fixed and adversarially
   verified.
2. **Design the identity/capability envelope** that resolves POK-024,
   POK-025 and POK-028 together.
3. **Ship dispute plus chain-derived job recovery** before any real escrow
   campaign (POK-026 and POK-027).
4. Fix the denomination regression and operational findings.
5. Run two adversarial end-to-end testnet jobs: one successful execution and
   one malicious/invalid delivery that the buyer disputes.
6. Only then perform a low-value mainnet canary with explicit caps and a kill
   switch.

## Verification performed

- `npm run lint` — passed.
- `npm run build` — could not complete in this execution environment because
  Turbopack was denied permission to bind an internal local port while
  processing CSS. The failure occurred before an application compile result;
  it is not evidence of a source error or of a successful production build.

## Not examined

- Altana account, KeyStore, relay and validator contract bytecode.
- ERC-8183 commerce/router/policy contract bytecode and economic assumptions.
- Upgradeability/admin keys and pause powers of every dependency.
- Formal calldata-policy capabilities of the Altana validator.
- Production secrets, Fly configuration, backups and incident access.
- Browser/device matrix for WebAuthn recovery.
- Mainnet execution with real funds.
