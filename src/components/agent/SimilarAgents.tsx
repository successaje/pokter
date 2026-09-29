import Link from 'next/link';

import { AgentCard } from '@/components/AgentCard';
import { listSearchable } from '@/lib/marketplace';
import { offersDirectHire, verdictFor } from '@/lib/search/match';
import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';

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

  const peers = all
    .filter(
      (entry) =>
        entry.listing.category === category &&
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
    /*
     * One agent per publisher.
     *
     * Two operators account for eighteen of the eighty listings by registering
     * the same agent repeatedly — the first version of this strip showed five
     * BORT clones out of eight slots, which is a worse answer than the back
     * button it replaced. Alternatives have to be alternatives; the rest of a
     * publisher's fleet is one click away in the category.
     */
    .filter((entry, index, list) => {
      const owner = entry.listing.agent.owner_address?.toLowerCase();
      if (!owner) return true;
      return (
        list.findIndex(
          (other) => other.listing.agent.owner_address?.toLowerCase() === owner,
        ) === index
      );
    })
    .slice(0, 8);

  if (peers.length === 0) return null;

  return (
    <section
      aria-labelledby="similar-agents-title"
      className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-strong)]">
            Keep looking
          </p>
          <h2
            id="similar-agents-title"
            className="display mt-2 text-2xl sm:text-3xl"
          >
            {meta ? `Other ${meta.label.toLowerCase()} agents` : 'Similar agents'}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
            Ranked on what has been observed rather than what was declared.
            Agents that have returned a signed price come first.
          </p>
        </div>

        <Link
          href={CATEGORY_ROUTES[category]}
          className="text-[12px] text-[color:var(--text-muted)] underline decoration-dotted underline-offset-2 hover:text-[color:var(--text)]"
        >
          See all {meta?.label.toLowerCase() ?? 'agents'} →
        </Link>
      </div>

      {/*
        A scroller rather than a grid. Eight cards do not fit a row at any
        width this page uses, and a grid would either truncate the set to three
        or add a third of a page of height to a page that is already long.
        `overscroll-x-contain` matters more than it looks: without it a sideways
        component in a trackpad gesture scrolls past the end of the strip and
        chains to the page, which reads as the whole page sliding away. Snap is
        proximity rather than mandatory for the same reason — mandatory fights
        a vertical scroll that drifts a few pixels horizontally.
      */}
      <ul className="-mx-6 flex snap-x snap-proximity gap-4 overflow-x-auto px-6 pb-2 [scrollbar-width:thin] sm:-mx-8 sm:px-8">
        {peers.map((entry) => (
          <li
            key={`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`}
            className="w-[19rem] shrink-0 snap-start"
          >
            <AgentCard
              listing={entry.listing}
              verdict={verdictFor(entry)}
              record={entry.record}
              hirable={offersDirectHire(entry)}
            />
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/agents"
          className="rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
        >
          Browse all agents
        </Link>
        <Link
          href="/discover"
          className="rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
        >
          Find my best match
        </Link>
      </div>
    </section>
  );
}
