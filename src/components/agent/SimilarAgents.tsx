import Link from 'next/link';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { listSearchable, preferDistinctOwners } from '@/lib/marketplace';
import { verdictFor } from '@/lib/search/match';
import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { isPromotableAgent } from '@/lib/agents/eligibility';

const CATEGORY_ROUTES: Record<Category, string> = {
  rebalancing: '/categories/rebalancing',
  'grid-trading': '/categories/grid-trading',
  yield: '/categories/yield',
  'health-factor': '/categories/health-factor',
};

/**
 * The alternatives, on the page where someone decides against this agent.
 *
 * An agent page ends in a decision whose answer is frequently no — the
 * endpoint is not answering, the record is thin, nobody has named a price. A
 * link back to a category is a second search; these are the answers to the
 * first one, already ranked and already carrying their evidence badge, so the
 * comparison that matters can be made without leaving.
 *
 * Ordered by what has been measured rather than by registry position: agents
 * that answer and can quote come first, because an alternative that cannot be
 * hired is not an alternative.
 */
export async function SimilarAgents({
  category,
  chainId,
  tokenId,
}: {
  category: Category | 'unclassified';
  chainId: number;
  tokenId: string;
}) {
  if (category === 'unclassified') return null;

  const all = await listSearchable({ limit: 30 }).catch(() => []);
  const meta = CATEGORY_BY_ID.get(category);

  const ranked = all
    .filter(
      (entry) =>
        entry.listing.category === category &&
        isPromotableAgent(entry.listing.agent) &&
        !(
          entry.listing.agent.chain_id === chainId &&
          entry.listing.agent.token_id === tokenId
        ),
    )
    /*
     * Rank on evidence, not on the registry's order. `quote` is the strongest
     * signal available — an agent that returned a signed price has answered a
     * real request — then answered probes, then attestations.
     */
    .sort((a, b) => {
      const quoted = Number(b.listing.quote != null) - Number(a.listing.quote != null);
      if (quoted !== 0) return quoted;
      const answered = b.record.totalAnswered - a.record.totalAnswered;
      if (answered !== 0) return answered;
      return b.listing.attestationCount - a.listing.attestationCount;
    })
    .slice(0, 24);

  /*
   * One agent per publisher, then backfill.
   *
   * Two operators account for eighteen of the eighty listings by registering
   * the same agent repeatedly, and the first build of this strip filled five
   * of its eight slots with clones from one of them — a worse answer than the
   * back button it replaces. This is the rule the hire page already applies
   * when it offers alternatives, shared rather than written twice: prefer a
   * distinct publisher, then fill the remaining slots from what is left, so a
   * thin category still shows a full row.
   */
  const peers = preferDistinctOwners(ranked, 4);

  if (peers.length === 0) return null;

  return (
    <section
      aria-labelledby="similar-agents-title"
      className="flex flex-col gap-4 border-t border-[color:var(--border)] pt-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="similar-agents-title" className="text-lg font-semibold">
          Keep looking
        </h2>

        <Link
          href={CATEGORY_ROUTES[category]}
          className="text-[12px] text-[color:var(--text-muted)] underline decoration-dotted underline-offset-2 hover:text-[color:var(--text)]"
        >
          See all {meta?.label.toLowerCase() ?? 'similar agents'} →
        </Link>
      </div>

      <ul className="-mx-1 flex snap-x snap-proximity gap-3 overflow-x-auto px-1 pb-2 overscroll-x-contain [scrollbar-width:thin]">
        {peers.map((entry) => {
          const agent = entry.listing.agent;
          const availability = entry.record.totalProbes > 0
            ? `${Math.round((entry.record.totalAnswered / entry.record.totalProbes) * 100)}% answered`
            : 'Not measured';
          return (
            <li key={`${agent.chain_id}:${agent.token_id}`} className="w-[17rem] shrink-0 snap-start sm:w-[19rem]">
              <Link
                href={`/agents/${agent.chain_id}/${agent.token_id}`}
                className="group flex min-h-20 items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 transition-colors hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)]"
              >
                <AgentAvatar name={agent.name} src={agent.image_url} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <strong className="line-clamp-1 text-[13px] font-semibold">{agent.name}</strong>
                    <EvidenceBadge verdict={verdictFor(entry)} />
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-[10px] text-[color:var(--text-faint)]">
                    <span>{availability}</span>
                    <span aria-hidden>·</span>
                    <span>{entry.record.totalProbes} probe{entry.record.totalProbes === 1 ? '' : 's'}</span>
                  </span>
                </span>
                <span aria-hidden className="text-[color:var(--text-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--text)]">→</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
