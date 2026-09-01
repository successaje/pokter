# Altana

**Status: working. Grant, on-chain registration, and revocation all verified on BSC testnet.**

Last verified: 2026-09-01, against `@altananetwork/sdk@0.8.0`.

## What we intended

The §32 checklist: an Altana-controlled agent wallet, a scoped session with a
contract allowlist, a spend cap and an expiry, the session registered in the
on-chain KeyStore, a transaction on BSC, displayed in Pokter, and revocable
from Pokter.

## What we used

- `@altananetwork/sdk@0.8.0` (ESM-only)
- Network: `BNB_TESTNET` — chain 97, relay `https://testnet-relay.altana.network`,
  KeyStore `0x6b8361C29d05D498b1a12B54A37310f94171E94A`
- `viem` for independent receipt, bytecode and balance verification

## Checklist

| Requirement | Status | Evidence |
| --- | --- | --- |
| Agent has own wallet | Working | Smart account `0xAe4473468F10b507AB410077FA266FD8c5Af2196` |
| Session key exists | Working | Registered secp256k1 key returned by `grantSession` |
| Spend cap exists | Working | 0.05 BNB/week and 0.02 BNB/day granted |
| Contract allowlist exists | Working | Per-function rules; verified present in on-chain calldata |
| Expiry exists | Working | 7-day and 1-day sessions granted |
| Session registered on-chain | Working | `register: true`; KeyStore touched in every grant receipt |
| Real transaction exists | Working | Five successful transactions, listed below |
| User can revoke | Working | Two revocations confirmed on-chain |
| Evidence captured | Working | `npx tsx scripts/verify-tx.mts` |

## Verified transactions

All on BSC testnet (chain 97), all `status: success`, all touching the KeyStore.

| Action | Tx | Block | Gas |
| --- | --- | --- | --- |
| Grant (spike) | [`0x21e6bb4c…`](https://testnet.bscscan.com/tx/0x21e6bb4c7ed791a4db78a99a38af8f4bdfe067f9d245271a4b8cb44eae3ba580) | 128470830 | 968,112 |
| Revoke (spike) | [`0x97f52de5…`](https://testnet.bscscan.com/tx/0x97f52de55c7de8e7c344c12785afbbc1a9981348dfee4ccb412804fc497fedaa) | 128470871 | 154,259 |
| Grant, monitor agent — empty allowlist | [`0x157d5951…`](https://testnet.bscscan.com/tx/0x157d595133ad88a777d71fb0a79b0b161c5192272f26c656c2339282711c1585) | 128471017 | 555,315 |
| Revoke, monitor agent | [`0x9eaf149e…`](https://testnet.bscscan.com/tx/0x9eaf149e9e9cdd14e7fb192a699d8b62b1d06d3c7239b8e2f50eb8de12a9eae6) | 128471112 | 137,159 |
| Grant, rebalancer — scoped allowlist | [`0x590e8923…`](https://testnet.bscscan.com/tx/0x590e892308c8d2feba5bf6771f7fde0d24c604e89e828adff44a4a2d20980256) | 128471128 | 809,822 |

The last three came from the product itself (`POST` / `DELETE /api/altana/session`),
not from a script.

## The allowlist is enforced on-chain, not in the UI

The strongest evidence here is a comparison between two grants:

- The **rebalancer** grant carries the PancakeSwap V3 Position Manager address
  (`0x427bF5b3…`) inside its on-chain calldata.
- The **monitor** grant, whose allowlist is deliberately empty, does not.

So the scoping a user sees on the permission screen is the scoping written to
the chain. A call outside it reverts at validation time in the Altana account
contract — Pokter is not the thing enforcing it, and could not weaken it.

## What failed on the way

`grantSession` failed while the wallet was unfunded:

```
Reason: 0x

Details: 0x
```

`createClient` and `createWallet` both succeed with **zero gas** — the smart
account is counterfactual and its address equals the admin EOA's — so the first
real failure appears at the first *write*, which made this easy to misread as an
SDK problem. It was not: `grantSession` with `register: true` writes to the
KeyStore and needs gas. The relay returns a bare `0x` revert with no reason
string, so the API surfaces it verbatim rather than translating it.

Funding the wallet with 0.2 tBNB resolved it. Five grants and revocations have
since cost roughly 0.0035 tBNB in total.

## Reproducing

```bash
npx tsx --env-file=.env.local scripts/altana-spike.mts   # full lifecycle
npx tsx scripts/verify-tx.mts                            # verify recorded txs
```

## Known limitations

- Session signers are held in memory and never written to disk. A restart loses
  the ability to *execute* under an existing session; the grant itself survives
  and stays revocable by public key, since revocation targets the registered
  key rather than a local object. A production deployment would hand the signer
  to the agent process at grant time.
- The wallet is Pokter-operated for the demo. The user-wallet path is the same
  call with the user's own signer — custody follows the signer in Altana's
  model, and Altana never persists keys.
- Executing a strategy call *through* a session key (as opposed to granting and
  revoking one) is not yet implemented. The SDK's ERC-8183 helpers
  (`hireErc8183Agent`, `buildHireCalls`, `settleErc8183Job`) are the intended
  route and are unexplored.

## Notes

- The SDK is ESM-only. Scripts importing it need a `.mts` extension, or Node
  resolves it through the CJS loader and throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- Relay transactions are submitted by relay-operated EOAs, so `tx.from` is not
  the user's wallet. Verify authority through the KeyStore logs, not the sender.
