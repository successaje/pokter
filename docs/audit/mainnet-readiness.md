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
| Critical | 0 | 5 | 0 | — |
| High | 0 | 3 | 0 | — |
| Medium | 0 | 3 | 0 | — |
| Scoped (swap) | 0 | 5 | 1 | — |
| Info | — | — | — | 5 |

**Every raised finding is closed**, one of them Accepted with its reasoning
recorded. What still blocks migration is the *Not examined* list — chiefly the
third-party contracts the enforcement claim rests on — and the fact that the
integrated swap-and-hire path has not yet been run end to end with a funded
mainnet wallet.

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
**Status: Fixed** · bounds now network-aware

`PermissionReview.tsx:250-252` allows 0.001–1 BNB, defaulting to 0.05. Those
were chosen when a BNB was worth nothing.

The user signs their own grant, so this is their decision and the server
cannot bound it — which makes the slider the only control that exists.

**Fix.** `src/lib/altana/caps.ts` sets the range per network. Testnet keeps
0.001–1 at a 0.05 preset. Mainnet tightens to 0.001–0.25 at a 0.02 preset —
roughly $12 to start against a $150 ceiling at $600/BNB. Conservative on
purpose: dragging further is a deliberate act, while a generous default is one
nobody has to notice.

The cap now also renders its dollar equivalent, priced from the same
PancakeSwap pool the product already quotes, and omitted rather than guessed
when pricing fails. **Verified:** mainnet resolves to `{min: 0.001, max: 0.25,
preset: 0.02}`, the preset reads `$12.00`, and a null price yields no figure.

**Still a product decision.** These numbers are a safe starting point, not a
researched one. Revisit before real volume.

### POK-006 · Session signers do not survive a restart
**Status: Fixed** · the store is gone

`session.ts:46` holds session signers in an in-process `Map`. SDK 0.9.0 warns
that losing a session key makes its authorization unusable.

It does not bite today because Pokter never acts as the agent and revocation
targets the registered public key. On mainnet, with real value behind a
session, the blast radius changes even though the mechanism does not.

**Fix.** The `Map` was written on grant and deleted on revoke, and **never
once read** — it held a live signing key in memory to no purpose. Removed
entirely rather than secured, because the answer to "does Pokter hold a
session key on mainnet" is no, and a capability that does not exist cannot be
reached by accident later.

The day Pokter executes on a user's behalf, that signer becomes a real secret
needing real storage. It should arrive as a deliberate addition rather than
something already half present.

### POK-007 · Rate limiting is per-process and resets on deploy
**Status: Fixed** · for the deploy case; still per machine

`security/rate-limit.ts` keeps counters in memory. They reset on every deploy
and do not span machines, so scaling past one instance multiplies every limit
by the instance count.

**Fix.** Counters moved to SQLite on the mounted volume. The deploy reset was
the realistic failure — during a campaign each deploy quietly reopened a full
window to anyone watching, and nothing errored to signal it. Old rows are
pruned hourly.

**Verified:** a limit of three allowed three calls and refused the fourth, a
different caller was unaffected, and a fresh process reading the same volume
still refused — which is the deploy case.

**Still per machine.** The volume is not shared, so two instances double every
limit. Left open as a scaling note rather than solved, because the fix is a
shared store and this deployment has one machine.

---

## Medium

### POK-016 · Mainnet guards cannot be exercised in isolation
**Status: Fixed** · the guard no longer drags the SDK in

`altana-sdk#88` makes the SDK unresolvable under `--conditions=react-server`,
which is the condition `server-only` modules need. So a script can import the
demo seller *or* the SDK, never both, and POK-004's guard could only be
confirmed by inspection at each entry point rather than by running it.

The guard is three lines and its condition is a single boolean, so confidence
is reasonable — but "verified by reading" is not what this register means by
verified, and the gap is recorded rather than glossed.

**Fix.** The guard moved to `src/lib/erc8183/demo-guard.ts`, which imports no
SDK and reads `ALTANA_NETWORK` directly — the value that decides what gets
signed, rather than the one that decides what the label says. Waiting on an
upstream fix was not necessary; the coupling was ours.

**This also upgrades POK-004 from inspected to verified:** with
`ALTANA_NETWORK=bnb` the guard refuses and with `bnb-testnet` it allows, run
rather than read.

### POK-008 · DNS rebinding between check and fetch
**Status: Fixed** · the connection is pinned to the checked address

`proof/prober.ts:104` resolves a hostname, checks every address against the
private ranges, and returns the URL — then `fetch` resolves again. A host that
answers public on the first lookup and private on the second is not caught.

Reachable only through a URL committed on chain, so an attacker must control
an agent's deliverable URL and run a rebinding resolver.

**Fix.** `assertPublicEndpoint` now returns a handle whose connection is
pinned, via an undici dispatcher with a `lookup` that hands back the address
already inspected. There is no second resolution to poison.

It exposes `fetch` as a method rather than the dispatcher as a field, so a
caller reaching for `.url` and a bare `fetch` cannot silently reopen the
window. All five call sites — prober, trial, notify-funded twice, and
deliverable verification — go through it.

**Verified:** loopback and the cloud metadata address still refused, a public
host resolves and its pinned fetch returns 200, and no dispatcher field is
reachable on the handle.

### POK-009 · Operator key can sign on mainnet when explicitly enabled
**Status: Fixed** · the hatch now names what it opens

`altana/client.ts:47` refuses the admin signer on mainnet unless
`ALTANA_ALLOW_MAINNET=true`. The guard is good. The risk is that enabling it
for one legitimate reason silently re-enables every operator-signed path.

**Fix.** `adminSigner` takes a purpose — `legacy-session`, `legacy-hire` or
`demo-seller` — and on mainnet each must be listed individually in
`ALTANA_MAINNET_OPERATOR_PURPOSES`. `ALTANA_ALLOW_MAINNET=true` is gone.

The old boolean meant enabling one legitimate use quietly re-armed the other
two. Worth stating plainly: every operator path is currently a demo path.
Real users sign with a passkey, so on mainnet the correct value for this
variable is empty.

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

## Scoped work · in-app BNB → $U swap

Raised before the code exists, because a swap is a new path that moves user
funds and should be designed against its failure modes rather than audited
after.

**Why it is needed.** ERC-8183 escrow is denominated in `$U`. Without a swap,
the mainnet hire flow asks a user to go and acquire United Stables somewhere
else and come back, which most will not finish. The token is liquid —
~$9.7M `U` against ~$9.3M USDT in the 0.01% PancakeSwap V3 pool — so the
obstacle is entirely one of flow, not of markets.

### POK-017 · Slippage bound must be justified, not inherited
**Status: Fixed** · 100 bps, with the measurement behind it

A generous default silently authorises a worse price. Against a pool this
deep, a hire-sized swap should move the price negligibly, so a wide tolerance
protects nothing and costs real money in an adverse market.

**Fix.** 100 bps, against the 150 that is conventional. **Measured:** the
implied price is identical — 1.295e-3 BNB per `$U` — at 0.1, 1 and 25 `$U`,
so a swap 250× the size of a hire still moves the pool by nothing detectable.

That is the whole argument. The tolerance is not absorbing price impact,
because there is none at this size; it exists only to survive BNB moving
between the quote and the signature. A wider band would not make the swap
more likely to land — it would only raise the ceiling on what a bad fill is
permitted to cost.

### POK-018 · Swap can succeed while the hire fails
**Status: Accepted** · sequential, with the failure made mild and legible

Acquiring `$U` and funding escrow are separate. A user can end up holding
tokens they never wanted, having paid swap fees, with nothing hired.

**Decision: accepted, not fixed.** The swap and the hire are two
transactions.

Atomicity was available — `buildHireCalls` returns the five hire calls, so
the two swap calls could have been prepended and executed as one batch. It
was rejected because `hireErc8183Agent` also predicts the jobId from
`jobCounter() + 1` and computes an expiry that must clear the policy's
dispute window. Going atomic means re-deriving both by hand, on the path that
moves money, to replace a tested SDK call. That is a worse trade than the
failure it avoids.

**Why the failure is mild.** Only the shortfall is swapped, so a hire that
fails afterwards leaves the user holding exactly the `$U` they needed, in a
liquid stablecoin, with the retry one button press away. They are further
along than when they started, not stranded.

**Revisit if** the SDK exposes a hire that accepts extra calls, or if jobId
prediction and expiry become readable helpers. Then atomicity costs nothing
and should be taken.

### POK-019 · Quotes go stale between reading and signing
**Status: Fixed** · deadline carried, and quoted at signing time

A quote read at render time and signed a minute later can be wrong by more
than the slippage bound, which surfaces as an opaque revert.

**Fix.** Every swap carries a 300-second deadline, and `SwapQuote` records
`quotedAt` so a caller can tell how old one is.

**Closed by the integration.** `CommissionPanel` quotes inside the commission
handler, immediately before building the calls and signing — never at render
time. A quote cannot outlive the click that produced it.

### POK-020 · Swapping exactly enough, not roughly enough
**Status: Fixed** · exact-output

An exact-input swap leaves the user holding dust they did not ask for and may
still fall short of the budget. The requirement is a specific amount of `$U`.

**Fix.** `quoteExactOutputSingle` and `exactOutputSingle`, so the `$U` amount
is fixed and the BNB cost varies. A second call to `refundETH` returns
whatever the router did not spend, so the user is charged the real price
rather than the worst-case one they had to authorise.

### POK-021 · The router becomes a new allowlisted target
**Status: Fixed** · the swap never touches a session

Swapping through a session means the PancakeSwap router must be callable.
Every address added to an allowlist widens what a granted agent may do.

**Fix.** The swap executes under the user's own admin authority — their
passkey signing `execute({ wallet, signer, calls })` — not through a granted
session. No agent allowlist gains the PancakeSwap router, and nothing an
agent may call widens as a side effect of a buyer acquiring tokens.

### POK-022 · Router addresses must be verified on chain
**Status: Fixed** · both read on chain

The SwapRouter and Quoter are new dependencies. A wrong address is the defect
that broke every testnet hire once already (`altana-sdk#84`).

**Fix.** SwapRouter (12,154 bytes) and QuoterV2 (8,331 bytes) both read on
BSC mainnet. The router's parameter shape was also determined by simulation
rather than assumed: it **requires `deadline` inside the tuple**, and the
variant without it reverts. The built calldata then simulated successfully
against mainnet.

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
- ~~**The `$U` payment token on mainnet.**~~ **Resolved.** It is United
  Stables (`0xcE24439F…`), 1.05B supply, with six live PancakeSwap V3 markets
  and roughly $19M of paired liquidity in the 0.01% U/USDT pool. Users can
  obtain it; the gap is flow, which the scoped swap above addresses.
