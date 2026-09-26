# Moving to pokter.xyz

> **Done — 26 September 2026.** Certificates issued for `pokter.xyz` and
> `www.pokter.xyz`, `fly.toml` updated, deployed and verified: the seller card
> reports the new origin, and job #1336 still verifies against the old one.
> Kept as the record of what was changed and why.

Run top to bottom. The verification step after the deploy is the one that
matters — skipping it risks committing a wrong URL on chain.

## 1. Buy it, then point DNS at Fly

Create these three records at the registrar. The values are this app's, read
from `flyctl ips list`:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| `A` | `@` | `66.241.125.129` | 300 |
| `AAAA` | `@` | `2a09:8280:1::180:c664:0` | 300 |
| `CNAME` | `www` | `pokter.fly.dev` | 300 |

The IPv4 is Fly's *shared* ingress, which is how most apps there run: requests
are routed by TLS SNI, so the certificate below is what makes it land on this
app. A dedicated IPv4 is available for about $2/month via
`flyctl ips allocate-v4` if you would rather not share, but it is not needed
for this.

Use a short TTL now. It costs nothing and means a mistake is minutes to undo
rather than a day.

Check it before moving on:

```bash
dig +short pokter.xyz A
dig +short pokter.xyz AAAA
```

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
