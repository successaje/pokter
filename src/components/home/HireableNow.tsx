import Link from 'next/link';

import { AgentCard } from '@/components/AgentCard';
import { CATEGORIES } from '@/lib/agents/categories';
import type { Listing } from '@/lib/marketplace';
import type { TrackRecord } from '@/lib/history/record';
import { offersDirectHire, verdictFor } from '@/lib/search/match';

type Entry = { listing: Listing; record: TrackRecord };

/**
 * Real agents on the landing page, one from each category Pokter judges.
 *
 * The outcome scenes that used to sit here were cut for being 1,858px of
 * prose, and the agents inside them went with the prose — which left a
 * marketplace whose front page showed no merchandise. The question in the
 * hero is not a substitute for that: it answers people who know what they
 * want, and a visitor who does not yet know needs to see what is on offer.
 *
 * One per category rather than the best four overall, because the best four
 * overall are not spread evenly — a straight ranking would show two health
 * factor monitors and nothing that rebalances, and the four categories are
 * the shape of the marketplace. A signed price comes first within each,
 * because an agent that has never named one cannot actually be hired today.
 */
export function HireableNow({ entries }: { entries: Entry[] }) {
  const picks = CATEGORIES.map(({ id }) => {
    const inCategory = entries.filter((e) => e.listing.category === id);
    const ranked = [...inCategory].sort((a, b) => {
      const quoted =
        Number(b.listing.quote != null) - Number(a.listing.quote != null);
      if (quoted !== 0) return quoted;
      return b.record.totalAnswered - a.record.totalAnswered;
    });
    return ranked[0] ?? null;
  }).filter((entry): entry is Entry => entry !== null);

  if (picks.length === 0) return null;

  const priced = entries.filter((e) => e.listing.quote != null).length;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--brand)]">
            Hireable now
          </p>
          <h2 className="font-[family-name:var(--font-serif)] text-2xl">
            One from each category.
          </h2>
        </div>
        <Link
          href="/agents"
          className="text-[12px] font-medium text-[color:var(--info)] underline decoration-dotted underline-offset-2"
        >
          All {entries.length} agents →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {picks.map((entry) => (
          <AgentCard
            key={`${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`}
            listing={entry.listing}
            verdict={verdictFor(entry)}
            record={entry.record}
            hirable={offersDirectHire(entry)}
          />
        ))}
      </div>

      {/*
        The denominator, because it is the honest part. Eight of these can be
        hired on a price they signed themselves; the rest need a budget
        offered into silence, and a front page that showed four cards without
        saying so would be implying a market that is larger than it is.
      */}
      <p className="text-[11px] text-[color:var(--text-faint)]">
        {priced} of {entries.length} indexed agents have signed a price. The
        rest can be offered a budget, which they may never answer.
      </p>
    </section>
  );
}
