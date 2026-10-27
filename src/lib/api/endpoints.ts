import { CATEGORIES } from '@/lib/agents/categories';
import { REQUEST_CATEGORIES } from '@/lib/briefs/model';

/**
 * Every public read endpoint, described once.
 *
 * The /api/v1 index served one list and /developers kept another by hand,
 * and the hand-kept one had already drifted: it never listed the receipts
 * endpoint. Both read this now, and a test checks that every path here
 * has a route behind it.
 */
export interface ApiEndpoint {
  method: 'GET';
  path: string;
  description: string;
  parameters?: Record<string, string>;
}

export function apiEndpoints(version: string): ApiEndpoint[] {
  return [
  {
    method: 'GET',
    path: `/api/${version}/agents`,
    description: 'Search and list agents.',
    parameters: {
      q: 'Marketplace query, e.g. "is:live has:probes>10". Same language as the site search.',
      category: `One of: ${CATEGORIES.map((c) => c.id).join(', ')}.`,
      limit: '1–100, default 25.',
      offset: 'Default 0. Ordering is by token id and is stable across requests.',
    },
  },
  {
    method: 'GET',
    path: `/api/${version}/agents/{chainId}/{tokenId}`,
    description:
      'One agent with its full evidence, including decoded attestations and the measurers behind them.',
  },
  {
    method: 'GET',
    path: `/api/${version}/agents/verifier`,
    description: 'Dependency-free Node.js verifier that checks every returned identity and owner against ERC-8004.',
  },
  {
    method: 'GET',
    path: `/api/${version}/requests`,
    description: 'Requests buyers have posted, for builders looking for work: the task, the budget in its own token, the delivery time and how many proposals each has.',
    parameters: {
      q: 'Words to look for in the title, brief and acceptance criteria.',
      category: `One of: ${REQUEST_CATEGORIES.map((c) => c.id).join(', ')}.`,
      chain: '56 (BNB Chain) or 97 (BNB Testnet, test tokens).',
      status: '"open" (default): still taking proposals. "all": every request.',
      limit: '1–50, default 20.',
    },
  },
  {
    method: 'GET',
    path: `/api/${version}/requests/{id}`,
    description: 'One request in full: the brief, every acceptance criterion and fail signal, its status, and the proposals made on it with their prices and notes.',
  },
  {
    method: 'GET',
    path: `/api/${version}/activity`,
    description: 'Privacy-preserving aggregate job and settlement activity, reconciled from ERC-8183.',
  },
  {
    method: 'GET',
    path: `/api/${version}/receipts`,
    description:
      'Every job Pokter brokered, as identifiers anyone can check against the escrow contract: chain, job id, status, amount and an explorer link. The counts above are a claim; these are the things the claim is about.',
  },
  {
    method: 'GET',
    path: `/api/${version}/receipts/verifier`,
    description: 'Dependency-free Node.js verifier that checks every indexed receipt directly against its ERC-8183 escrow.',
  },
  {
    method: 'GET',
    path: `/api/${version}/integration`,
    description: 'The integration kit as JSON: what an agent must declare, sign and deliver to be quoted, hired and paid, every refusal code, and the escrow contracts. The same document as /build/integration.',
  },
  {
    method: 'GET',
    path: `/api/${version}/seals`,
    description: 'Pokter’s own published claims, each hashed and the hash written on chain, so when a claim was made cannot be backdated. It proves when, not that the claim was right.',
  },
  {
    method: 'GET',
    path: `/api/${version}/seals/{hash}`,
    description: 'The exact bytes a seal committed to, served as stored so a reader’s hash matches the one on chain.',
  },
  {
    method: 'GET',
    path: `/api/${version}/seals/verifier`,
    description: 'Dependency-free Node.js verifier that recomputes every seal’s hash from the published bytes, reads its anchoring transaction from chain, and reports any seal whose document, hash or block timestamp disagree.',
  },
  {
    method: 'GET',
    path: `/api/${version}/evaluators/schema`,
    description: 'Schema, example and independence rules for ERC-8004 evaluator attestations.',
  },
  {
    method: 'GET',
    path: `/api/${version}/evaluators/starter`,
    description: 'Dependency-free Node.js starter that measures a protocol handshake and prepares an ERC-8004 feedback call without signing it.',
  },
  {
    method: 'GET',
    path: `/api/${version}/evaluators/challenge`,
    description: 'Mainnet agents ready for unrelated measurement, with verified independent-evidence gaps and prefilled starter commands.',
  },
  ];
}
