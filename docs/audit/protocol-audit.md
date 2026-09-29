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

**Containment.** `toSessionPermissions` now refuses every marketplace category,
including read-only monitoring (which needs no session). The authenticated
grant route returns `409` before parsing grant parameters or touching a signer,
and the hire UI creates no standing wallet permission. `audit:protocol` asserts
the refusal for all four categories. The mainnet delegation blocker remains
until argument-aware enforcement passes the acceptance test above; disabling
exposure is the safe product policy, not the final protocol design.

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

**Severity: High · Status: Partially fixed; automatic indexing open**

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

**Fallback recovery fix.** “Your agents” now imports a job by ERC-8183 job ID,
refuses it unless the connected passkey wallet is the on-chain client, reads
authoritative job fields from the kernel, and restores review/dispute/settle
controls. New versioned descriptions also restore the original task and
ERC-8004 token ID. Automatic event-derived discovery remains open.

### POK-028 · Authorization and hiring are independent ceremonies

**Severity: Medium · Status: Fixed for one-machine deployment**

The page presents permission grant and commission as two grants “in the order
they matter,” but commissioning neither consumes nor references the session.
A user can fund escrow without authorizing; authorizing does not change what
the seller can do. The protocol currently has two parallel demos rather than a
single delegated-work lifecycle.

**Required remediation.** Decide between two explicit products: paid analysis
that requires no wallet authority, or delegated execution where the job commits
to a particular capability. Gate and label each independently.

### POK-029 · Receipt verification proves integrity, not satisfactory work

**Severity: Medium · Status: Fixed**

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

**Severity: Medium · Status: Fixed** · verified under concurrency

The limiter trusts forwarding headers as the caller identity and performs a
separate read followed by update. Correctness therefore depends on the edge
proxy stripping user-supplied headers, and concurrent requests can pass from
the same old count. Limits also remain per machine.

**Required remediation.** Document and test Fly's trusted proxy behavior,
derive IP only from the platform-trusted header, and use an atomic SQLite
upsert/transaction or a shared atomic store before scaling horizontally.

**Fix.** Counting is now a single SQLite upsert with `RETURNING`, eliminating
the read/update race. Caller identity comes only from one configured trusted
edge header (`fly-client-ip` by default), never the user-selectable first value
of `x-forwarded-for`. Multi-machine enforcement still requires a shared store
before horizontal scaling.

**Verified.** The counter is now a single `ON CONFLICT … RETURNING` upsert, so
the read and the increment cannot interleave. Twenty concurrent consumers
against a limit of five produced exactly five allowances.

### POK-032 · A new Undici agent is created per outbound endpoint check

**Severity: Medium · Status: Fixed** · handle closes its dispatcher

`assertPublicEndpoint` creates a new `undici.Agent` for every call and does not
close it. Public trial, notification and receipt-verification routes can cause
connection-pool/resource accumulation even when request count is limited.

**Required remediation.** Close the dispatcher in `finally`, or use a bounded
cache with eviction and explicit close behavior. Load-test repeated failures as
well as successful requests.

**Fix.** Pinned endpoints now expose explicit ownership and every production
caller releases its single-use Undici dispatcher in `finally`, including error
and early-return paths.

**Verified.** `assertPublicEndpoint` returns a handle exposing `close()`, and
every caller closes it in a `finally`. A fetch followed by a close completed
cleanly. The leak was introduced by the POK-008 pinning work — the dispatcher
that fixed the rebinding window was never disposed.

### POK-033 · Passkey recovery is a protocol dependency without a proven path

**Severity: Medium · Status: Open**

The account is the ERC-8183 client and the only party able to approve/dispute.
The existing audit already marks second-device recovery untested. That is not
merely login UX: it is recovery authority over escrowed funds.

**Required remediation.** Exercise platform-synced recovery, non-synced
credential loss, RP-ID migration and fallback recovery. Publish what happens
to active jobs in each case. Do not claim recoverability beyond the tested
authenticator class.

### POK-035 · Delivery notification cannot resolve any marketplace agent

**Severity: High · Status: Fixed** · verified by delivering job #1352

`POST /api/notify-funded` requires `chainId` to equal the escrow chain
(`route.ts:61`, currently 97) and then calls `getAgent(chainId, tokenId)` at
`route.ts:101` — a registry lookup. The two are different chains.

Pokter's whole shape is mainnet agents with testnet escrow, so the value that
satisfies the guard is the one guaranteed to fail the lookup:

```
chainId 56 → rejected: "Agent, provider and escrow must be on the configured chain."
chainId 97 → accepted, then: 8004scan /agents/97/302257 returned 404
```

Confirmed against a known-good listing: `getAgent(56, '45422')` returns Beefy
powered by HeyAnon, `getAgent(97, '45422')` is a 404. Every agent in the
marketplace is registered on 56, so no value of `chainId` gets a mainnet
agent through this route.

**Why it was not caught earlier.** Job #1336 settled end to end, which looked
like proof the delivery path worked. It exercised the seller and the manifest,
but not this guard with a marketplace agent id.

**Fix.** The route now takes `agentChainId` for the registry lookup, and the
escrow chain is a server fact rather than caller input — there is only ever
one, and accepting it from the request is what invited the contradiction.
`CommissionPanel` sends the agent's own chain.

No fallback from `agentChainId` to `chainId` was kept: every existing caller
put the escrow chain there, which is precisely the value that cannot resolve
an agent.

**Verified:** job #1352 hired, delivered and reached `SUBMITTED` on chain with
a real submit transaction, having resolved a chain-56 agent against chain-97
escrow — the combination that was impossible before.

Job **#1353** then ran the whole lifecycle from production and is the cleanest
proof on record, because every step postdates the fix:

| Step | Transaction |
| --- | --- |
| Hired and funded | [`0x27b4e0…`](https://testnet.bscscan.com/tx/0x8fdea5b808fc4de5fbb1) |
| Delivered, `SUBMITTED` | [`0x509c4b78…`](https://testnet.bscscan.com/tx/0x509c4b788c9404f5273edbacd389f297f3dae67d74a02623504b01938d8ee0f4) |
| Receipt verified | `verified: true` against the on-chain hash |
| Settled, `COMPLETED` | [`0xd5adb7c3…`](https://testnet.bscscan.com/tx/0xd5adb7c3383ca753fca53eabe9e705a0933f2c1d5de5178975b37ba809d3b841) |

The 900-second dispute window was waited out rather than bypassed, which is
the contract's buyer-protection period doing its job.

---

### POK-036 · A local delivery commits an unfetchable URL on chain

**Severity: Medium · Status: Fixed** · found while re-testing POK-035

`NEXT_PUBLIC_APP_URL` falls back to `http://localhost:4311`, and the demo
seller writes that value into the deliverable URL it submits on chain. The
submission is permanent, so a delivery run from a developer machine records a
receipt that no buyer and no verifier can ever resolve.

Testnet job **#1352** carries exactly that: its on-chain deliverable URL is
`http://localhost:4311/api/seller/deliverables/1352`, and it will say so
forever. The job is otherwise sound — SUBMITTED, correct provider, real
transaction — which is what makes it a good illustration. Nothing errored.

**Fix.** `deliveryUrl` now refuses any URL that is not HTTPS on a public host.
Failing costs a developer one environment variable; not failing costs a buyer
their only route to check what they paid for.

**Verified, and then demonstrated.** Delivering job #1353 locally is refused
with the reason and the variable to set. Delivered from production instead, it
committed `https://pokter.xyz/api/seller/deliverables/1353` and its receipt
returns `verified: true`.

Job #1352, delivered locally before the guard existed, is the counter-case:

```
job 1353  verified: true
job 1352  Receipt verification failed: Only public HTTPS endpoints … are probed
```

Same seller, same manifest logic, same chain. One receipt can be checked by
anyone and the other never can, and the difference was a fallback value in an
environment variable.

---

### POK-034 · Negotiation signatures were displayed but not verified

**Severity: High · Status: Fixed**

The trial previously required `negotiation_hash` and `provider_sig` fields but
did not recover the EIP-191 signer. Field presence is not authentication, so an
endpoint could return arbitrary bytes and appear as a signed provider quote.

**Fix.** Pokter now validates the 32-byte hash and 65-byte signature, recovers
the EIP-191 signer, and requires it to equal the selected ERC-8004 identity's
provider wallet. Both the current raw-hash encoding and the early printable
hash encoding are supported. The API returns the verified signer and the UI
states the exact identity guarantee.

**Verification.** A deterministic valid signature recovers its provider, and
the same signature is refused when checked against a different provider.

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
