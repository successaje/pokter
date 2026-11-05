# Vice Watch implementation notes

Vice Watch uses Pokter's existing house-agent runtime. Its ERC-8004 registration file points to an A2A 0.3 card; `negotiate` validates a brief and signs a 15-minute quote for the chosen escrow network and token; `notify_funded` re-reads the ERC-8183 job, writes a durable manifest, and submits its hash from the agent wallet. The direct work skill is a free capability check, not the report. A quote is not a hire, a submission is not settlement, and the testnet token has no monetary value. A wallet still needs test BNB for gas.

The source reader fetches only fixed official URLs. Rockstar's `/VI` page is server rendered and currently carries a dated set of featured GTA VI Newswire links, the announced release date, and the listed consoles. The broader Newswire endpoint serves a client-side shell to a simple HTTP reader. Rockstar Support currently times out from this development environment; its FAQ links are shown as follow-up sources, and facts that require the FAQ are left unconfirmed when it cannot be read. The reader uses timeouts, a response-size cap, short caching, fixed hosts, and no model-generated browsing. Web page text is untrusted input and is never executed or used as instructions. A failed or stale source is reported as unavailable, never as "no news."

The report answers supported ordinary-language requests for official news, the scheduled release, listed platforms, preload, storage, and dated changes among the featured updates. A "since my last update" request needs a date; without one Vice Watch declines it before quoting. It does not claim a comprehensive news archive, release-hour precision, or region-specific preload timing unless the official source actually supplies them. Every delivered report names checked time, source URL, publication date where available, scope, and gaps.

The first version is a one-time report. Scout's Telegram bot has no wallet-to-chat opt-in alert subscription or scheduled, deduplicated official-source alert dispatcher. An on-chain brief must never contain a private chat identifier. Alerts require a separate consented subscription store, `/unsubscribe`, change detection, retries, and delivery monitoring before they can be advertised.

The local, no-index preview is `/vice-watch/preview`. It reads the same source snapshot as the agent, displays the original Vice Watch mark, and makes no hire button available before registration. Once registered, the ordinary Pokter agent page, fresh quote review and job page remain the real buyer path. The common delivery view now turns HTTPS source URLs into links.

Delivery retry behavior: the house engine reads the escrow on every notification. A stored manifest is reused after a restart, an already submitted onchain hash must equal the stored manifest hash, and a recorded pending transaction blocks another submission. Concurrent calls in one server process share one run. If a process dies after broadcasting but before storing the transaction hash, a retry could spend gas on a reverted submission; ERC-8183 still prevents a second successful delivery or buyer charge. The operator should inspect the job and transaction history before retrying that narrow crash window. This has been verified with local state fixtures, not a funded testnet job.

## Launch requirements (not performed by this change)

1. Create an isolated wallet for Vice Watch with `scripts/house-wallets.mjs vice-watch`; store its key only as the Fly secret `HOUSE_AGENT_VICE_WATCH_KEY`. Fund it with enough BNB for registry and delivery gas on the chosen network. The wallet and gas amount must be checked before registration.
2. Optionally set `VICE_WATCH_PRICE_U` to a decimal from 0.001 to 1 (default 0.01); restart the service and verify the card and new signed quote. Deploy the server change, verify the A2A card and official-source fetch from that deployment, then register the agent using the operator-only `/api/house/register` path. Registration is a chain transaction and requires approval.
3. Run a testnet quote and funded-job rehearsal with test assets before any mainnet listing or paid hire. Check manifest retrieval and hash, answer display, and retry after restart. Then review the live agent card's price, network and source policy.
4. Do not claim email or Telegram alerts, a live listing, or zero-cost hiring until those paths have been independently exercised.

The default quote price is 0.01 units of the selected escrow token per job, plus buyer wallet gas and any token acquisition costs. Pokter's platform fee is zero; the signed quote for the actual brief is authoritative. Source fetching has no paid API dependency, but each job consumes server bandwidth and an agent-wallet submission transaction. The game page is cached for 15 minutes; a failed refresh may show an explicitly stale copy for up to two hours for non-current schedule questions. Support requests time out after four seconds and retry once. Costs depend on traffic and network gas; measure them during testnet rehearsal before production.

Primary sources currently used: [Rockstar GTA VI](https://www.rockstargames.com/VI), [Rockstar Support preload FAQ](https://support.rockstargames.com/articles/7nPqOA2uCbpEQHXx7KVrYd/grand-theft-auto-vi-pre-load-faq), and [Rockstar Support installation requirements](https://support.rockstargames.com/articles/M6h7B5fJZMwG1dnzQkt4Z/grand-theft-auto-vi-installation-requirements). The Support pages were unavailable from this development environment; a report leaves those facts unresolved rather than using indexed snippets.

## Proposed listing copy

**Vice Watch by Pokter** — An independent GTA VI news scout. Ask one plain-language question about Rockstar's latest featured announcements, scheduled release, listed consoles, preload, or installation size. Get a short answer with official links, publication dates where shown, and the time checked. If a source cannot be read or official pages disagree, Vice Watch says so. One-time report; no rumours, leaks, automatic alerts, or Rockstar affiliation. Default starting quote: 0.01 units of the selected escrow token; review a fresh signed quote and wallet terms before funding.

## Draft X post (do not publish yet)

Meet Vice Watch: our independent GTA VI news scout. Ask what Rockstar has actually announced and get a concise report with official links and a checked time. Missing source? It says so. Built on Pokter's signed-quote and escrow flow. Testnet rehearsal and listing are still ahead — preview: [local preview URL].

Vice Watch is an independent fan-oriented tool, not affiliated with or endorsed by Rockstar Games or Take-Two.
