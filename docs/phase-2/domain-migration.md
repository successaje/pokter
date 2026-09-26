# Moving to pokter.xyz

Run top to bottom. The verification step after the deploy is the one that
matters — skipping it risks committing a wrong URL on chain.

## 1. Buy it, then point DNS at Fly

```bash
flyctl ips list
```

Create these records at the registrar, using the addresses that prints:

| Type | Name | Value |
| --- | --- | --- |
| `A` | `@` | the IPv4 from `flyctl ips list` |
| `AAAA` | `@` | the IPv6 from `flyctl ips list` |
| `CNAME` | `www` | `pokter.fly.dev` |

## 2. Issue certificates

Both, so visitors typing either form land somewhere valid.

```bash
flyctl certs add pokter.xyz
flyctl certs add www.pokter.xyz
flyctl certs show pokter.xyz
```

Wait for `Certificate Authority: Let's Encrypt` and a ready status before the
next step. It usually takes a few minutes once DNS resolves.

## 3. Point the app at its new name

Two values in `fly.toml` under `[env]`:

```toml
NEXT_PUBLIC_APP_URL = 'https://pokter.xyz'
NEXT_PUBLIC_PASSKEY_RP_ID = 'pokter.xyz'
```

`NEXT_PUBLIC_APP_URL` is what `demo-seller` writes into the deliverable URL it
commits on chain, so it has to be right before any further job is delivered.

`NEXT_PUBLIC_PASSKEY_RP_ID` pins passkeys to the apex, so a credential made on
`www.pokter.xyz` still signs on `pokter.xyz`. Without it the rpId follows
whichever host the user typed and the two get separate, incompatible wallets.

```bash
flyctl deploy --now
```

## 4. Verify before announcing

```bash
curl -s https://pokter.xyz/api/health
curl -s https://pokter.xyz/api/seller/card | head -c 200
```

The card must report `https://pokter.xyz`, not the old host. If it still says
`fly.dev`, the build did not pick up the change — fix that before anything
delivers another job, because the URL goes on chain.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://www.pokter.xyz/
curl -s "https://pokter.xyz/api/deliverables/verify?jobId=1336"
```

Job #1336's deliverable URL is pinned to `pokter.fly.dev` on chain and stays
that way — it is an immutable record of where that receipt lived. Keep the
`fly.dev` host resolving so historical receipts stay verifiable; the new
domain is for everything from here.

## 5. Afterwards

- Update the live URL in `README.md` and in `docs/phase-2/tracking.md`.
- Send Damian the URL, socials, one-line description and brand kit.
- Send Gwen `docs/phase-2/tracking.md`.

## Passkeys made before the move

They were bound to `pokter.fly.dev` and will not work on `pokter.xyz`. Nothing
is lost that matters — the wallets hold testnet funds and no user depends on
them — but create a fresh passkey on the new domain and re-check the hire flow
end to end before launch day.
