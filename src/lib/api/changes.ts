/**
 * Changes to Pokter's public read API and MCP output, newest first.
 *
 * Served on /developers and in the /api/v1 index, because a field that moves
 * without notice breaks whoever reads it. The receipt verifier's
 * `completedValueRaw` was removed on 26 October 2026 with a migration note
 * that existed only in the repository, where no API caller would see it.
 *
 * One list for both, so the page and the index cannot disagree. An entry is
 * added with the change it describes, unreleased (no date, no release),
 * because the release number is assigned by the deploy and a guessed one
 * is wrong whenever anything else ships first. Once deployed it is given
 * its day and its release, and is never edited afterwards except to
 * correct it.
 */
export interface ApiChange {
  /** The day it went live, UTC; null until it has. */
  date: string | null;
  /** The production release that carried it; null until a deploy has, shown as "Unreleased". */
  release: string | null;
  /** `breaking`: a field was removed. `changed`: a field kept its name and changed what it holds. `added`: nothing existing changed. */
  kind: 'breaking' | 'changed' | 'added';
  /** The endpoints or MCP tools it affects. */
  surfaces: string[];
  summary: string;
  details: string[];
  /** What a caller should do, when anything. */
  migrate: string | null;
}

export const API_CHANGES: ApiChange[] = [
  {
    date: null,
    release: null,
    kind: 'changed',
    surfaces: ['GET /api/v1/agents/{chainId}/{tokenId}', 'GET /api/v1/agents', 'MCP get_agent'],
    summary: 'A newer failed price check is no longer hidden by an older signed price, and responses say when they were built.',
    details: [
      '`hireBlocker` can now be set while `price` holds a payable signed quote: when Pokter’s scheduled price check has failed since that quote, for a reason that is not transient. It used to be null whenever a payable quote was stored.',
      'Adds `priceCheck` to an agent: the most recent price check, `{ at, outcome, source }`. `outcome` is `signed` or the failure code; `source` is `scheduled` (Pokter’s own check) or `buyer` (a signed quote a buyer’s brief got). A buyer’s failed request is not included, because it can be about that buyer’s brief.',
      'Adds `generatedAt`, the time the response was built, beside the top-level `observedAt`, which always meant the same and is kept. A price’s own time is `price.quotedAt`; a blocker’s is `hireBlocker.observedAt`.',
    ],
    migrate: 'Read `generatedAt` instead of the top-level `observedAt`. Treat `hireBlocker` as current even when `price` is set, and show `priceCheck` beside a price that is older than it.',
  },
  {
    date: '2026-10-27',
    release: 'v559',
    kind: 'added',
    surfaces: ['GET /api/v1/receipts', 'MCP job_status'],
    summary: 'Each job links its public evidence page.',
    details: [
      'Receipts add `page`: the job’s evidence page at /jobs/{chainId}/{jobId}, which reads the job from the escrow and checks its delivery against the hash on chain.',
      'MCP job_status adds `evidencePage`, the same page.',
      'No existing field was removed or changed.',
    ],
    migrate: null,
  },
  {
    date: '2026-10-27',
    release: 'v556',
    kind: 'added',
    surfaces: ['GET /api/v1/requests', 'GET /api/v1/requests/{id}', 'MCP search_requests', 'MCP get_request', 'MCP prepare_proposal', 'MCP integration_kit'],
    summary: 'Requests buyers have posted can be read, and a proposal prepared for its owner to sign.',
    details: [
      '`GET /api/v1/requests` lists requests (open ones unless `status=all`), filtered by `q`, `category` and `chain`, each with its budget in its own token (`budget.amount`, `budget.symbol`, `budget.token`), delivery time, closing date, status and number of proposals. `GET /api/v1/requests/{id}` adds the brief, the acceptance criteria, the fail signals and the proposals, without their signatures.',
      'MCP `search_requests` (with `for_agent` to match an agent’s category), `get_request` and `prepare_proposal` are read-only. `prepare_proposal` checks a proposal against the request and the ERC-8004 owner and returns a link that opens it on the request’s page for the owner to sign; it sends and stores nothing.',
      '`integration_kit` adds `proposalFlow`, who does each step of winning a request. No existing field was removed or changed.',
    ],
    migrate: null,
  },
  {
    date: '2026-10-27',
    release: 'v549',
    kind: 'added',
    surfaces: ['GET /api/v1/agents', 'GET /api/v1/agents/{chainId}/{tokenId}', 'MCP get_agent', 'MCP search_agents'],
    summary: 'Every price names its payment route.',
    details: [
      '`route` is "escrow" in every agent price: `price.value.route` on the list, `price.route` on one agent and on MCP get_agent. Every price Pokter reports is an ERC-8183 escrow quote; pay-per-call (x402) prices are not reported.',
      'MCP search_agents adds `priceRoute`: "escrow" when the agent has a signed price, otherwise null. `price` and `priceCurrent` are unchanged.',
      'No existing field was removed or changed.',
    ],
    migrate: null,
  },
  {
    date: '2026-10-27',
    release: 'v548',
    kind: 'changed',
    surfaces: ['GET /api/v1/agents/{chainId}/{tokenId}', 'MCP get_agent'],
    summary: 'A hire blocker can now be sourced to the registry data, with provenance "declared".',
    details: [
      '`hireBlocker.provenance` is "declared" when the blocker comes from the registry data Pokter reads (the indexer’s copy of the agent’s registration) naming no A2A endpoint. No agent card was read in that case, and `hireBlocker.source` says so. Every other blocker is "pokter-measured", as before.',
      'The `no-endpoint` reason text now says which read found nothing to call: the registry data, a card that names no A2A interface, or a card without an HTTPS JSON-RPC interface.',
      '`hireBlocker.code` and `hireBlocker.transient` are unchanged.',
    ],
    migrate: 'Branch on `hireBlocker.code`, not on the reason text, which is written for people.',
  },
  {
    date: '2026-10-26',
    release: 'v541',
    kind: 'breaking',
    surfaces: ['GET /api/v1/receipts/verifier'],
    summary: 'The receipt verifier totals completed value per token; `byChain[].completedValueRaw` is removed.',
    details: [
      'Removed: `byChain[].completedValueRaw`. It added together the raw budgets of every completed job on a chain, whatever its token, which is wrong once a chain has two tokens.',
      'Added: `byChain[].completedByToken`, one entry per token on that chain, `{ chainId, token, completed, completedValueRaw }`, and a top-level `completedByToken` with the same entries across both chains.',
      '`token` is the address the escrow reports through `jobPaymentToken`; null means unread, never $U. `completedValueRaw` is in that token’s own base units.',
      'Receipts that name a token are also checked against the escrow’s `paymentToken`: a receipt naming the wrong token fails verification.',
      'Unchanged: `verified`, `completed`, `outsideTeam`, `team`, `indexed` and `mismatched`.',
    ],
    migrate: 'Read `byChain[].completedByToken`. For the old $U-only figure, take the entry whose `token` is that chain’s $U (0xcE24439F2D9C6a2289F741120FE202248B666666 on 56, 0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565 on 97). Never add entries with different tokens together.',
  },
  {
    date: '2026-10-26',
    release: 'v541',
    kind: 'changed',
    surfaces: ['GET /api/v1/receipts'],
    summary: 'A receipt’s budget is in the job’s own token.',
    details: [
      '`budget.amountU` is null unless the job is in $U. It was the raw budget read at 18 decimals, whatever the token.',
      'Added: `budget.token`, `budget.symbol` and `budget.amount`, the amount in that token’s own units. A token Pokter has not read is `token: null`, never presented as $U.',
      '`budget.raw` is unchanged.',
    ],
    migrate: 'Read `budget.amount` with `budget.symbol`, and treat `budget.amountU` as $U-only.',
  },
  {
    date: '2026-10-26',
    release: 'v541',
    kind: 'changed',
    surfaces: ['GET /api/v1/activity'],
    summary: 'Activity values are $U only, with every token’s figure beside them.',
    details: [
      '`indexedValue` and `completedValue` (in `activity`, `buyers` and each `byChain[]` entry) count jobs in the chain’s $U only. Jobs in other tokens are never added to them.',
      'Added: `valueByToken.indexed` and `valueByToken.completed`, per chain and token, with jobs whose token is unread in their own bucket.',
    ],
    migrate: 'For value in any token other than $U, read `valueByToken`.',
  },
  {
    date: '2026-10-26',
    release: 'v541',
    kind: 'changed',
    surfaces: ['GET /api/v1/agents', 'GET /api/v1/agents/{chainId}/{tokenId}', 'MCP get_agent'],
    summary: 'An agent’s price is reported in the token it was signed in.',
    details: [
      'In the price (`price.value` on the list, `price` on one agent): `amountU` is null unless the price is in $U, and is deprecated. It was the quoted number whatever the token, so 0.5 USDT read as `amountU: 0.5`.',
      'Added: `amount` (exact, in that token’s units), `symbol`, `decimals` and `settlementChainId`. They are null for a token Pokter has not verified.',
      '`priceRaw` and `currency` are unchanged.',
    ],
    migrate: 'Read `amount` with `symbol`.',
  },
];
