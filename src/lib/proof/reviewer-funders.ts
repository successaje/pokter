import 'server-only';

import { refreshFunders } from '@/lib/funding/store';
import { listFeedbacks } from '@/lib/scan/client';
import { resolveAttestationAuthors } from './attestation-authors';

/** Agents whose reviewers are looked up per sweep pass. */
const AGENTS_PER_PASS = 15;

/*
 * How long one agent's reviewers stand before they are read again. The slice
 * changes hourly and the sweep runs every ten minutes, so without this each
 * slice was read six times an hour, and an agent's feedback page can run to
 * several megabytes, too large for the fetch cache to keep. Reviewers change
 * slowly and the funders they lead to are kept for good, so a day is enough.
 */
export const REVIEWERS_FRESH_MS = 24 * 60 * 60_000;
/* Per process, not per copy of this module, which the server may bundle more than once. */
const shared = globalThis as typeof globalThis & { __pokterReviewerReads?: Map<string, number> };
const readAt = (shared.__pokterReviewerReads ??= new Map<string, number>());

/** For tests: forget which agents were read. */
export function resetReviewerReads(): void {
  readAt.clear();
}

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
  { now = Date.now(), list = listFeedbacks }: { now?: number; list?: typeof listFeedbacks } = {},
): Promise<{ enabled: boolean; agents: number; skipped: number; looked: number; found: number } | null> {
  if (!process.env.NODEREAL_API_KEY) return { enabled: false, agents: 0, skipped: 0, looked: 0, found: 0 };
  const reviewed = agents.filter((a) => a.chain_id === 56 && (a.total_feedbacks ?? 0) > 1);
  // Rotate through them, a slice per hour, so every reviewed agent is reached.
  const start = reviewed.length ? (new Date(now).getUTCHours() * AGENTS_PER_PASS) % reviewed.length : 0;
  const slice = [...reviewed.slice(start), ...reviewed.slice(0, start)].slice(0, AGENTS_PER_PASS);

  const due = slice.filter((agent) => {
    const at = readAt.get(agent.id);
    return at === undefined || now - at >= REVIEWERS_FRESH_MS;
  });

  const authors = new Set<string>();
  for (const agent of due) {
    const page = await list({ chainId: 56, agentId: agent.id, limit: 50 }).catch(() => null);
    /* Only a page that arrived counts as read; a failed read is tried again next pass. */
    if (!page) continue;
    readAt.set(agent.id, now);
    if (!page.items.length) continue;
    const resolved = await resolveAttestationAuthors(56, agent.owner_address, page.items);
    for (const author of resolved.values()) if (author.address && author.independence === 'independent') authors.add(author.address);
  }
  const result = await refreshFunders([...authors]);
  return { enabled: result.enabled, agents: due.length, skipped: slice.length - due.length, looked: result.looked, found: result.found };
}
