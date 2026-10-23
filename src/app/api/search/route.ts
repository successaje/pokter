import { NextResponse } from 'next/server';

import { getJobStore } from '@/lib/erc8183/store';
import { getQuestStore } from '@/lib/quest/store';
import { listSearchableWithStatus } from '@/lib/marketplace';
import { headerSuggestions, parseHeaderQuery, type SuggestAgent, type SuggestJob } from '@/lib/search/header-query';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Suggestions for the header search, as the person types.
 *
 * Read from what Pokter already holds and nothing else: the shared
 * catalogue, built once a minute for every page, and the local job index.
 * A keystroke never reaches a chain or the registry, so typing cannot slow
 * the one CPU the site runs on. An agent or job missing from both is not
 * suggested; an exact "56/123" reference still links to the agent page,
 * which reads the registry itself.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`header-search:${requestClientKey(request)}`, { limit: 90, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many searches. Wait a moment.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  }

  const raw = new URL(request.url).searchParams.get('q') ?? '';
  const query = parseHeaderQuery(raw.slice(0, 120));
  if (query.kind === 'empty') return NextResponse.json({ suggestions: [] });

  /* Already built for the pages; a failed build suggests nothing rather than failing the box. */
  const { entries } = await listSearchableWithStatus({ limit: 400 }).catch(() => ({ entries: [] }));
  /* Registered wallets, kept by the capability sweep, and read only when an address was typed. */
  const wallets =
    query.kind === 'address' ? new Map(getQuestStore().allAgentWallets().map((row) => [`${row.chainId}:${row.tokenId}`, row.wallet])) : null;
  const agents: SuggestAgent[] = entries.map(({ listing: { agent } }) => ({
    chainId: agent.chain_id,
    tokenId: agent.token_id,
    name: agent.name,
    wallet: wallets?.get(`${agent.chain_id}:${agent.token_id}`) ?? null,
    owner: agent.owner_address,
  }));
  /* Only a number can name a job, so only a number reads the index. */
  const jobs: SuggestJob[] =
    query.kind === 'number'
      ? getJobStore()
          .all()
          .filter((job) => job.jobId === query.value)
          .map((job) => ({ jobId: job.jobId, chainId: job.chainId, status: job.status, agentName: job.agentName || null }))
      : [];

  return NextResponse.json(
    { suggestions: headerSuggestions(query, agents, jobs) },
    /* Per person and short: the index changes as jobs are funded. */
    { headers: { 'cache-control': 'private, max-age=30' } },
  );
}
