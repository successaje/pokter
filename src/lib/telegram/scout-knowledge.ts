import 'server-only';

import { GUIDES } from '@/lib/guides/catalogue';

type Doc = { path: string; label: string; facts: string; matches: RegExp };

// Concise product facts from /llms.txt and the linked public guides. Keep the
// source path beside each fact so Scout can offer the page a reader can check.
const DOCS: Doc[] = [
  {
    path: '/guides/hire-an-agent', label: 'Hiring guide',
    matches: /\b(hire|hiring|pay|payment|quote|escrow|fund|refund|dispute|delivery|deadline|wallet)\b/i,
    facts: 'Search and evidence are free. A buyer writes the exact brief, gets a fresh price signed by the agent wallet, reviews network/token/amount/deadline, and funds one ERC-8183 escrow job in their own wallet. The agent is paid after delivery and the review window unless a successful dispute prevents release. Escrow does not judge quality. Testnet tokens have no monetary value.',
  },
  {
    path: '/guides/list-your-agent', label: 'Builder guide',
    matches: /\b(build|builder|create|register|list|publish|endpoint|a2a|agent wallet|integration)\b/i,
    facts: 'A hireable agent needs an ERC-8004 identity on BNB Chain or Testnet, a public HTTPS A2A card and endpoint, and an agent wallet that signs quotes. Builder Studio checks the endpoint, quote and delivery path. A registration alone is not a track record. The builder must verify wallet ownership before editing a profile or publishing services.',
  },
  {
    path: '/guides/find-jobs', label: 'Find jobs guide',
    matches: /\b(request|proposal|bid|find jobs|posted work|respond to work)\b/i,
    facts: 'A request describes work but is not a funded hire. Eligible builders propose an agent, price and delivery time. The buyer reviews a proposal and separately confirms a funded hire in their wallet. Builder-directed requests are handled in the intended builder workspace and are not public open work.',
  },
  {
    path: '/methodology', label: 'Evidence methodology',
    matches: /\b(evidence|proof|check|measured|verdict|reliable|proven|review|score|active|responsive)\b/i,
    facts: 'Pokter separates publisher-declared claims from its own endpoint checks, agent-signed quotes, onchain registry facts, paid jobs and delivery receipts. Answering a check measures response, not delivered quality or investment performance. Missing evidence is missing, never a pass. Recent responsiveness is a check answered in the last 24 hours, not a promise the agent will accept a new task.',
  },
  {
    path: '/services', label: 'Services',
    matches: /\b(service|offer|package|starting price)\b/i,
    facts: 'A service is a scoped offer a builder publishes for an agent they currently own. The buyer reviews the scope and agent, supplies inputs, edits the brief, then asks that agent for a fresh signed quote. A previous quote is only price context. Opening a service does not create a funded job.',
  },
  {
    path: '/developers', label: 'Developer docs',
    matches: /\b(api|mcp|developer|integration|protocol|tool|assistant|docs|documentation|guide)\b/i,
    facts: 'Pokter has a read-only public API with provenance on figures and an MCP server for assistants. MCP can search, inspect evidence and prepare a hire, but no tool signs or moves money. Protocol and quote requirements are in the integration kit.',
  },
];

const OVERVIEW = `Pokter is an evidence-led marketplace for ERC-8004 AI agents on BNB Chain (56) and Testnet (97). Agent, builder, service, request, proposal and funded job are different things. The public /llms.txt and /api/v1 describe the marketplace and its current API. Provenance matters: declared is an operator claim, pokter-measured is Pokter's own check, attested is signed by the agent wallet, and onchain comes from the registry or escrow. Scout has no wallet-linked account access in Telegram and cannot monitor private jobs or send alerts. Never ask for wallet secrets.`;

export function scoutKnowledgeFor(message: string): { context: string; links: Array<{ text: string; path: string }> } {
  const selected = DOCS.filter((doc) => doc.matches.test(message)).slice(0, 2);
  const guideIndex = GUIDES.map((guide) => `${guide.title} (${guide.href}): ${guide.summary}`).join('\n');
  return {
    context: `${OVERVIEW}\nPublic guide index:\n${guideIndex}${selected.length ? `\nRelevant documentation:\n${selected.map((doc) => `${doc.label} (${doc.path}): ${doc.facts}`).join('\n')}` : ''}`.slice(0, 3200),
    links: selected.length ? selected.map((doc) => ({ text: doc.label, path: doc.path })) : [{ text: 'Pokter guides', path: '/guides' }],
  };
}
