# Set and Earn — tracking details

For BNB Chain Phase 2 verification. Everything below was read from chain or
from live transactions, not from documentation.

**Live URL:** https://pokter.xyz
**Repository:** https://github.com/successaje/pokter
**Network:** BSC testnet (chain 97) for sessions and escrow; the ERC-8004
identity registry is read from BSC mainnet (chain 56). Both are stated on the
site. Mainnet migration is planned before the campaign concludes.

---

## 1. Contract addresses

### ERC-8183 commerce, BSC testnet (chain 97) — where hires happen

| Role | Address |
| --- | --- |
| Commerce (jobs, funding, completion) | `0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE` |
| Evaluator router | `0xD7d36D66d2F1B608A0F943f722D27e3744f66F25` |
| Arbitration policy | `0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA` |
| Job registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Payment token (`$U`) | `0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565` |

### ERC-8183 commerce, BSC mainnet (chain 56) — for the migration

| Role | Address |
| --- | --- |
| Commerce | `0xEa4DAa3100A767e86FDed867729ae7446476EBA6` |
| Evaluator router | `0x51895229E12F9876011789B04f8698af06cCD6DA` |
| Arbitration policy | `0x9C01845705b3078Aa2e8cfF7520a6376FD766dE5` |
| Job registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| Payment token | `0xcE24439F2D9C6a2289F741120FE202248B666666` |

### Identity

Agents are read from the **ERC-8004 identity registry on chain 56**, indexed
through 8004scan. No mock data, no hardcoded lists — the marketplace has no
agent fixtures at all, and an empty registry response renders an empty
marketplace.

---

## 2. Events

All topics below were extracted from real transactions on chain 97, not from an
ABI file. Reference transactions:

- Hire and fund: [`0x93385d57…`](https://testnet.bscscan.com/tx/0x93385d5708964b0b6257b24b38ee00149fc53112445030d7227d43a6d90f9ac5)
- Settlement to `COMPLETED`: [`0xcecbf3fc…`](https://testnet.bscscan.com/tx/0xcecbf3fc43ba3edd609230b855cc6e1a4548b911bf5cd1177a263620e889dc33)

### A hire

`JobCreated(uint256,address,address,address,uint256,address)`
emitted by the commerce contract `0xa206c051…`

```
topic0 0xb0f0239bfdd96453e24733e18bfc24b70d8fadf123dd977473518dd577ee79b9
```

Paired with `JobRegistered(uint256,address,address)` on the router
`0xD7d36D66…`:

```
topic0 0xab6d9121f9311dd45d0b932fc9fb1a6562295bda63d5bab95e364ff926515715
```

### A deposit

`JobFunded(uint256,address,address,uint256)` on `0xa206c051…`

```
topic0 0xbdb056de345bfeadca7c9fd7df6430bdb83c677c8eefbb601dff56f34d3dac52
```

Preceded by `BudgetSet(uint256,uint256)`:

```
topic0 0x869e2577b006bf47ee981cf6fec2e25583548081c14b98deab587f77b5068038
```

### A job completion

`JobCompleted(uint256,address,bytes32)` on `0xa206c051…` — the `bytes32` is the
keccak hash of the deliverable committed on chain:

```
topic0 0x0fd54bd364fa9e67f17b091aefe930932c09fe7651cf5ad02c71a418f3341444
```

With `PaymentReleased(uint256,address,uint256)` for the escrow release:

```
topic0 0x21d71db5be59bb9fa133895586b7404307dd33fb93b16db09dc6f1d9d7d231b0
```

### A rating / verdict

`JobSettled(uint256,address,uint8,bytes32)` on the router `0xD7d36D66…` — the
`uint8` carries the buyer's settlement verdict:

```
topic0 0x771fbd01246ab044986d0a55b6d9b732fcfd6d7eaa5ee0d05110b0d23cf496fc
```

Pokter does not operate a separate star-rating system. The buyer's on-chain
settlement decision is the rating, because it is the only one backed by money.

---

## 3. How agent IDs and owner wallets are recorded

**Agent IDs** are ERC-8004 registry token IDs on chain 56. Pokter mints nothing
and maintains no parallel ID space. Routes are `/agents/{chainId}/{tokenId}`, so
every agent page URL contains its registry identity — for example
`/agents/56/45422`.

**Owner wallets** come from the registry's `owner_address` field, surfaced on
each agent page.

**Buyer wallets** are recorded on chain, not by us. Each ERC-8183 job carries a
`client` field naming the wallet that hired. Job #1336's client is
`0x87FE8B31F5b5ec06BC6F0D2f4569c26550a673dC` — a user passkey wallet, not an
operator key.

**Hires per wallet** is therefore answerable entirely from chain: filter
`JobCreated` on the commerce contract, or read `client` from any job id. Pokter
holds no authoritative off-chain record of who hired what, by design.

---

## 4. API endpoints

Because hires, deposits, completions and settlements are all on chain, no API
is required to verify quest completion. Two public read-only endpoints exist
for convenience:

| Endpoint | Returns |
| --- | --- |
| `GET /api/health` | Liveness. |
| `GET /api/deliverables/verify?jobId={id}` | Re-fetches the deliverable named on chain and checks its exact bytes against the committed hash. Returns `{ verified, jobId, deliverableUrl, onchainHash }`. |

The verification endpoint is rate limited to 12 requests per minute per IP. If
BNB needs a higher ceiling or an allowlisted key for monitoring, we can add one
on request.

Write endpoints that spend an operator key are deliberately not public. User
hires do not use them: the buyer's passkey wallet signs the grant and the
escrow client-side, so the funds and the authority are the user's throughout.

---

## 5. Team wallets

| Purpose | Address |
| --- | --- |
| Operator / demo seller (chain 97) | `0x60eF148485C2a5119fa52CA13c52E9fd98F28e87` |
| Prize / payout | `0xEF869BB780a5163E6D39E83817cD29af6DEaA784` |

Exclude both from quest counting. The operator key signs the demo seller's
deliverable submissions and historical demo records; it is not a user.

---

## 6. Known caveats, stated up front

- **The demo seller is ours.** Job #1336 was delivered by a Pokter-operated
  same-chain A2A seller, because the third-party test seller publishes no
  discoverable runtime. Its jobs are attributable to the operator wallet above
  and should not count as organic activity.
- **Rate limiting is in-process.** It resets on deploy and does not span
  machines. Tell us if the campaign needs something sturdier.
- **Testnet today.** Mainnet addresses are listed above and the migration is
  planned before the campaign concludes.
