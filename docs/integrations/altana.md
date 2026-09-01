# Altana

**Status: partial — blocked on testnet funding, not on the integration.**

Last verified: 2026-09-01, against `@altananetwork/sdk@0.8.0`.

## What we intended

The §32 checklist: an Altana-controlled agent wallet, a scoped session with a
contract allowlist, a spend cap and an expiry, the session registered in the
on-chain KeyStore, a real BSC transaction executed through the session key,
displayed in Pokter, and revocable from Pokter.

## What we used

- `@altananetwork/sdk@0.8.0` (ESM-only)
- Network: `BNB_TESTNET` — chain 97, relay `https://testnet-relay.altana.network`,
  KeyStore `0x6b8361C29d05D498b1a12B54A37310f94171E94A`
- `viem` for balance and bytecode reads

## What works

| Step | Result |
| --- | --- |
| `createClient({ chains: [BNB_TESTNET] })` | Works. No gas required. |
| `client.createWallet({ signer })` | Works. No gas required — the smart account is counterfactual, and the address equals the admin EOA address. |
| Permission modelling | Works. `SessionPermissions` supports per-function allowlists (`{ to, signature }`) and rolling spend caps (`{ limit, period }`). |
| Contract allowlist targets | Verified to hold bytecode on chains 56 and 97. PancakeSwap V3 deploys deterministically, so Router, Position Manager and Factory share addresses across both. |
| API surface | `POST/GET/DELETE /api/altana/session` implemented, with server-side bounds on spend cap and expiry. |
| UI | §31 permission review, authorize, and revoke are built and reachable at `/hire/[chainId]/[tokenId]`. |

## What fails

`client.grantSession(...)` — and therefore `revokeSession` and `execute`.

```
Grant failed: An error occurred while executing calls.

Reason: 0x

Details: 0x
```

**Cause:** the wallet holds 0 tBNB. `grantSession` with `register: true` writes
the session key to the on-chain KeyStore, which is a real transaction and needs
gas. `createWallet` succeeding without gas made this easy to miss — the failure
appears at the first *write*, not at setup.

The relay returns a bare `0x` revert with no reason string, so the error is not
self-describing. We report it verbatim in the API response rather than
translating it, since the raw message is what makes it diagnosable.

**Impact:** no on-chain evidence yet. Session grant, session registration, the
executed transaction and revocation are all downstream of this single step.

**Fallback:** none needed — this is not an SDK defect and needs no workaround.
The wallet requires funding once, from the faucet at
<https://testnet.bnbchain.org/faucet-smart>. The faucet is captcha-gated, so it
needs a human. Everything above the funding step is built and waiting.

## Reproducing

```bash
npx tsx scripts/altana-spike.mts
```

The spike walks each step and prints which succeed, which fail, and the address
that needs funding. It uses `ALTANA_ADMIN_KEY` from `.env.local` when set, and
an ephemeral key otherwise.

## Notes

- The SDK is ESM-only. Scripts importing it must use a `.mts` extension, or
  Node resolves it through the CJS loader and throws
  `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- The SDK also ships ERC-8183 helpers (`hireErc8183Agent`, `buildHireCalls`,
  `settleErc8183Job`, `getErc8183Job`) and ERC-8004 registration helpers. These
  are unexplored and are the natural route to §34 once funding lands.
- Session signers are held in memory and never written to disk. A restart loses
  the ability to execute under an existing session; the grant itself survives
  and stays revocable by public key. A production deployment would hand the
  signer to the agent process at grant time.
