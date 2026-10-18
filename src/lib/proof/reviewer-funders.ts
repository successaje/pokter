import 'server-only';

import { refreshFunders } from '@/lib/funding/store';
import { listFeedbacks } from '@/lib/scan/client';
import { resolveAttestationAuthors } from './attestation-authors';

/** Agents whose reviewers are looked up per sweep pass. */
const AGENTS_PER_PASS = 15;

/**
 * Look up who first funded the wallets that reviewed listed agents, so the
 * review-pattern check can see reviewers funded from one place (see
 * `reviewCoordination`).
 *
 * Only mainnet agents: the funder lookup reads BSC mainnet history. Off
 * without NODEREAL_API_KEY, like the owner-funder step, and bounded twice:
 * agents per pass here, lookups per pass in `refreshFunders`, which also
 * keeps a found funder for good so a wallet is looked up once.
 */
export async function refreshReviewerFunders(
  agents: ReadonlyArray<{ chain_id: number; token_id: string; id: string; owner_address: string | null; total_feedbacks?: number | null }>,
): Promise<{ enabled: boolean; agents: number; looked: number; found: number } | null> {
  if (!process.env.NODEREAL_API_KEY) return { enabled: false, agents: 0, looked: 0, found: 0 };
  const reviewed = agents.filter((a) => a.chain_id === 56 && (a.total_feedbacks ?? 0) > 1);
  // Rotate through them, a slice per hour, so every reviewed agent is reached.
  const start = reviewed.length ? (new Date().getUTCHours() * AGENTS_PER_PASS) % reviewed.length : 0;
  const slice = [...reviewed.slice(start), ...reviewed.slice(0, start)].slice(0, AGENTS_PER_PASS);

  const authors = new Set<string>();
  for (const agent of slice) {
    const page = await listFeedbacks({ chainId: 56, agentId: agent.id, limit: 50 }).catch(() => null);
    if (!page?.items.length) continue;
    const resolved = await resolveAttestationAuthors(56, agent.owner_address, page.items);
    for (const author of resolved.values()) if (author.address && author.independence === 'independent') authors.add(author.address);
  }
  const result = await refreshFunders([...authors]);
  return { enabled: result.enabled, agents: slice.length, looked: result.looked, found: result.found };
}
