# Mainnet readiness audit

**Scope.** Everything that moves user funds or grants authority over a user's
wallet, under a migration from BSC testnet (97) to BSC mainnet (56).

**Method.** Source review of every value-moving path, plus live reads against
both chains. Findings marked *Verified* were executed, not reasoned about.

**Started** 26 September 2026 · **Status: in progress — not cleared for mainnet**

---

## Summary

| Severity | Open | Fixed | Accepted | Verified |
| --- | --- | --- | --- | --- |
| Critical | 0 | 4 | 0 | — |
| High | 3 | 0 | 0 | — |
| Medium | 3 | 0 | 0 | — |
| Info | — | — | — | 5 |

**Still not cleared.** The four Criticals are fixed; three High findings
remain, and the *Not examined* list below is unchanged.

All four Criticals had one cause — the interface described testnet while the
money would be real — and are fixed at the root rather than per site:
`src/lib/network/presentation.ts` is now the single source for the
denomination, the explorer and whether a faucet exists at all. Fixing them
surfaced POK-015, which was the more dangerous version of the same problem.

---

## Critical

### POK-001 · Users are sent to a testnet faucet to fund a mainnet wallet
**Status: Fixed** · `7e1f0a2`

`WalletReadiness.tsx:76` and `PermissionReview.tsx:73` link to
`bnbchain.org/en/testnet-faucet`, and `WalletReadiness.tsx:98` links to a
testnet `$U` faucet. Neither is conditional on the active network.

On mainnet a user who cannot fund their wallet is told to collect free tokens
that do not exist on the chain they are transacting on. At best they are
confused; at worst they acquire testnet tokens believing they have funded a
real position.

**Remediation.** Network-aware funding guidance. On mainnet, no faucet link —
instruct the user to transfer real BNB, and name the amount.

### POK-002 · Explorer links hardcoded to the testnet explorer
**Status: Fixed** · `7e1f0a2`

`AgentDesk.tsx:3` and `AgentPipeline.tsx:6` hardcode
`https://testnet.bscscan.com/tx/`. A mainnet transaction linked there resolves
to nothing.

Evidence is the product's central claim. A receipt that 404s is worse than no
receipt, because the user cannot tell whether the transaction failed or the
link is wrong.

**Remediation.** Derive the explorer from the active network, as
`altana/client.ts` already does for other surfaces.

### POK-003 · Real BNB labelled as tBNB
**Status: Fixed** · `7e1f0a2`

`WalletReadiness.tsx:68,81,110` and `PermissionReview.tsx:73` render the
literal string `tBNB`. On mainnet the user is spending BNB.

A person who reads "needs at least 0.002 tBNB" reasonably concludes the amount
is worthless. It is the clearest possible way to have someone authorise real
money while believing they are not.

**Remediation.** Derive the denomination from the network.

### POK-004 · The demo seller is not network-gated
**Status: Fixed** · `7e1f0a2`

`demo-seller.ts` follows `ALTANA_NETWORK` throughout and has no testnet
guard. On mainnet it would accept a funded job, submit a canned deliverable
and take real payment.

The deliverable text says it exists to prove the lifecycle. Charging mainnet
money for it is indefensible regardless of the amount.

**Remediation.** Refuse to operate unless `IS_TESTNET`. Fail loudly at startup
rather than silently at delivery.

---

## High

### POK-005 · Spend-cap ceiling is unchanged for mainnet
**Status: Open**

`PermissionReview.tsx:250-252` allows 0.001–1 BNB, defaulting to 0.05. Those
were chosen when a BNB was worth nothing.

The user signs their own grant, so this is their decision and the server
cannot bound it — which makes the slider the only control that exists.

**Remediation.** Reconsider the ceiling and default for mainnet, and show the
fiat equivalent next to the figure so the number means something.

### POK-006 · Session signers do not survive a restart
**Status: Open** · previously documented as a known limit

`session.ts:46` holds session signers in an in-process `Map`. SDK 0.9.0 warns
that losing a session key makes its authorization unusable.

It does not bite today because Pokter never acts as the agent and revocation
targets the registered public key. On mainnet, with real value behind a
session, the blast radius changes even though the mechanism does not.

**Remediation.** Decide explicitly whether Pokter ever holds a session key on
mainnet. If yes, it needs real secret storage. If no, remove the `Map` so the
capability cannot be reached by accident.

### POK-007 · Rate limiting is per-process and resets on deploy
**Status: Open**

`security/rate-limit.ts` keeps counters in memory. They reset on every deploy
and do not span machines, so scaling past one instance multiplies every limit
by the instance count.

**Remediation.** Acceptable at one machine. Revisit before scaling, and say so
in the deployment notes rather than discovering it under load.

---

## Medium

### POK-016 · Mainnet guards cannot be exercised in isolation
**Status: Open**

`altana-sdk#88` makes the SDK unresolvable under `--conditions=react-server`,
which is the condition `server-only` modules need. So a script can import the
demo seller *or* the SDK, never both, and POK-004's guard could only be
confirmed by inspection at each entry point rather than by running it.

The guard is three lines and its condition is a single boolean, so confidence
is reasonable — but "verified by reading" is not what this register means by
verified, and the gap is recorded rather than glossed.

**Remediation.** Resolves itself when #88 is fixed upstream. Until then, cover
it with an end-to-end check against a mainnet-configured deployment before
migrating.

### POK-008 · DNS rebinding between check and fetch
**Status: Open**

`proof/prober.ts:104` resolves a hostname, checks every address against the
private ranges, and returns the URL — then `fetch` resolves again. A host that
answers public on the first lookup and private on the second is not caught.

Reachable only through a URL committed on chain, so an attacker must control
an agent's deliverable URL and run a rebinding resolver.

**Remediation.** Pin the resolved address and connect to it directly, or
accept with the reasoning recorded.

### POK-009 · Operator key can sign on mainnet when explicitly enabled
**Status: Open**

`altana/client.ts:47` refuses the admin signer on mainnet unless
`ALTANA_ALLOW_MAINNET=true`. The guard is good. The risk is that enabling it
for one legitimate reason silently re-enables every operator-signed path.

**Remediation.** Make the escape hatch narrower than a single boolean, or
enumerate in the register exactly which paths it unlocks.

---

### POK-015 · Server and browser can disagree about the network
**Status: Fixed** · `7e1f0a2` · *raised while fixing POK-001 to POK-004*

`ALTANA_NETWORK` decides what the server signs. `NEXT_PUBLIC_ALTANA_NETWORK`
decides what the interface says. They are separate variables, and
`NEXT_PUBLIC_ALTANA_NETWORK` was set nowhere — the two agreed only because
both were unset and defaulted to testnet.

Setting one at migration and not the other produces the worst outcome
available: real mainnet transactions described to the user as testnet, with
every safety label reading correctly and meaning nothing. This was the more
dangerous form of POK-003, and it would not have been caught by reading either
file alone.

**Fix.** `assertNetworkAgreement()` runs inside `adminSigner()`, before
anything can sign. **Verified** by forcing a mismatch: the guard threw, and
accepted the matched case.

**Verification of POK-001 to POK-003.** With `NEXT_PUBLIC_ALTANA_NETWORK=bnb`
the presentation module resolves to `BNB`, `FAUCETS: null`, and
`https://bscscan.com/tx/…`. Eleven hardcoded testnet references across six
components and one error class now derive from it, including the ones in error
paths — which were the easiest to miss and the most likely to be read by
someone already confused.

---

## Verified safe

### POK-010 · Mainnet contracts hold bytecode · **Verified**
All seven checked on chain 56: PancakeSwap V3 Router and Position Manager,
and the ERC-8183 commerce, router, policy, registry and payment token. The
130-byte results are minimal proxies, which is expected.

### POK-011 · Mainnet arbitration policy is whitelisted · **Verified**
`policyWhitelist(0x9C01845705b3078Aa2e8cfF7520a6376FD766dE5)` returns `true`
on the mainnet router. This is the exact defect that broke every testnet hire
(`altana-sdk#84`), checked on mainnet before rather than after.

### POK-012 · Operator-funded write endpoints are not public · **Verified**
`POST /api/hire` and `POST /api/altana/session` both return 403 without the
demo-write secret, confirmed against production.

### POK-013 · Users sign their own grants and escrow · **Verified**
`PermissionReview` and `CommissionPanel` sign with the visitor's passkey in
the browser. Job #1336's on-chain `client` is `0x87FE8B31…`, a user wallet,
not the operator key.

### POK-014 · Permission scoping is enforced on chain · **Verified**
`scripts/prove-enforcement.mts`: identical calldata to an allowlisted target
was accepted, and to an unlisted one refused with `UnauthorizedCall` from the
account contract.

---

## Not examined

Stated so the coverage above is not mistaken for completeness.

- **The Altana account contract and the ERC-8183 kernel themselves.** Third
  party, unaudited by us, and we rely on both for enforcement.
- **Passkey recovery on a second device.** The flow exists; it has not been
  exercised against mainnet.
- **Behaviour when a session expires mid-job**, and whether escrow can strand.
- **Gas estimation under mainnet congestion**, and what a user sees when a
  grant runs out of gas halfway.
- **The `$U` payment token on mainnet** — a different contract from testnet,
  with no faucet and unverified liquidity. Whether users can obtain it at all
  is an open product question, not only a technical one.
