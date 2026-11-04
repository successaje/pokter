# Builder storefront implementation plan

## Current behaviour

- ERC-8004 registry ownership and the indexer supply public agent identities. A wallet profile can be published with signed self-provided text and chosen, registry-checked agents. Unpublished wallets already have a registry-only page. Agent and builder evidence are separate; historical agent jobs are not attributed to a current owner.
- Requests are signed, public, persisted SQLite briefs. Proposals name an agent and carry a fresh agent quote; funding happens later in the existing escrow hire flow. The Risk Desk custom-request link currently sends an address through the composer and persists `target_builder`; proposal and quote routes recheck agent ownership. The composer can silently fall back to an open request for an invalid target, and duplicate signed submissions can create multiple briefs.
- Building has a domain-bound, expiring, one-use wallet challenge for proving agent control. Profile edits instead use timestamped signatures; uploads and service publishing need their own server-side authorisation. Notifications already support a builder workspace inbox and opt-in verified email. There is no persisted service model or services catalogue.

## Model and permission decisions

- Builder identity is a checksummed wallet address. A claimed public profile is a wallet-signed published record; a registry-derived page remains available without an account. Agent associations are keyed by network and token ID and rechecked with the registry for actions. A transferred agent immediately loses the old owner's service publishing rights; existing service records are retained but become unavailable.
- Services are separate SQLite records with a builder wallet, network/token agent key, scope, buyer inputs, deliverable, category, lifecycle state and immutable revision. Only the current registry owner with a verified builder session can publish or edit. Public listings show only active services whose agent is still owned and available. An edit creates a new revision; request/hire records retain a scope snapshot.
- A targeted request stays a public signed brief with a structured target wallet. Only agents currently owned by that wallet can propose. The request is visible to everyone, but this restriction is enforced by the proposal and quote API; onchain data is public and protocol-level exclusivity is not claimed. An unclaimed builder has no request CTA. No request creates escrow or guarantees a notification delivery.
- Profile edits and service writes use a fresh domain-bound, expiring, single-use challenge signed by the controlling wallet. Service writes recheck current registry ownership, the published profile and its selected agent. Existing profile image uploads store only an inert, size-limited raster blob; attaching one to a profile still requires the signed edit. Reads remain public and private drafts retain their existing wallet-signature gate.

## Migration and verification

- Add columns/tables lazily using the existing SQLite migration style; older briefs and profiles remain readable. Backfill is unnecessary: old requests have a null builder target and old profiles have no services. Keep archived services for historical references. Rollback is a code rollback; leave added nullable columns/tables in place to preserve records.
- Test challenge expiry/replay, profile and service permissions, owner change, target persistence/exclusivity, duplicate submission, expiry, service lifecycle, quote/hire handoff and existing routes. Use fixtures and mock wallets only; run lint, types, unit/route/browser tests and production build. Verify desktop and mobile screenshots locally. No production mutation, wallet transaction, push or deploy.

## Current implementation boundary

- A service is a builder-published scope, not a fixed-price product. The editable scope and buyer inputs become a brief in the existing hire flow, which obtains a fresh agent-signed quote. The link carries the originating `service` and `revision`, and the funded job stores the exact brief and quote through the existing hire path. The hire record does not yet retain a structured service ID; historical revision contents remain in the service store. Existing escrow safeguards remain authoritative. No service-specific delivery score is inferred from agent history.
- Targeted requests remain public signed briefs in Pokter's database. The builder sees them in Building and in the existing builder notification inbox. Verified opt-in email and browser notifications only occur through the existing channels. The endpoint restricts proposals and quotes to agents whose *current* registry owner is the target. This is server-enforced exclusivity in Pokter, not a private or onchain exclusivity promise.
