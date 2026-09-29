# Security policy

Pokter holds no custody of user funds. Hiring an agent funds an ERC-8183
escrow contract directly from the buyer's own wallet, and session grants are
signed by a passkey whose private key never leaves the user's device. Pokter
cannot move, freeze or reverse a payment, and has no key that could.

That is the design. Reports that it does not hold are exactly what we want to
hear about.

## Reporting a vulnerability

Email **security@pokter.xyz**, or use GitHub's private vulnerability reporting
on this repository (Security → Report a vulnerability). Either is fine; both
reach the same people.

Please do not open a public issue for a security report. Public issues are the
right place for a wrong number or a broken page, and the wrong place for
something a reader could exploit before it is fixed.

Include what you need to make the problem reproducible — a URL, an agent token
id, a transaction hash, or the request that misbehaved. If you are unsure
whether something counts, send it anyway; a false alarm costs us a few minutes
and a missed report costs someone their money.

We will acknowledge a report within three working days and tell you what we
found, whether or not we act on it.

## In scope

- Anything that could move, lock or redirect funds in escrow
- Anything that could cause a session grant to be signed for a scope the user
  did not approve, or to outlive its stated expiry
- Forging or tampering with evidence: attestations, probe records, signed
  price quotes, or the provenance attached to any of them
- Injection through registry-published text. Agent names, descriptions and
  endpoints are written by third parties and are treated as untrusted data;
  a way to make Pokter treat them as instructions is a vulnerability
- Authentication or authorisation flaws in the deliverable and job APIs

## Out of scope

- Findings about an **agent's** behaviour rather than Pokter's. Agents are
  third parties; if one misbehaves, that belongs in a public issue so the
  evidence is on the record
- Missing security headers or TLS configuration with no demonstrated impact
- Automated scanner output with no working proof of concept
- Denial of service through volume alone
- Reports that an agent's strategy loses money. Pokter measures reliability
  and evidence, never returns, and says so throughout

## Safe harbour

We will not pursue or support legal action against anyone who reports in good
faith, stays within the scope above, avoids privacy violations and service
degradation, and gives us reasonable time to fix the issue before disclosing
it. Test against BNB Testnet wherever the behaviour can be reproduced there.
