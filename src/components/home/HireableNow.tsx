'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AgentCard } from '@/components/AgentCard';
import { CATEGORIES } from '@/lib/agents/categories';
import { isPromotableAgent } from '@/lib/agents/eligibility';
import type { Listing } from '@/lib/marketplace';
import type { TrackRecord } from '@/lib/history/record';
import { offersDirectHire, verdictFor } from '@/lib/search/match';

type Entry = { listing: Listing; record: TrackRecord };
type Spotlight = 'recommended' | 'reliable' | 'recent';

const TABS: { id: Spotlight; label: string; description: string }[] = [
  {
    id: 'recommended',
    label: 'Recommended',
    description: 'A strong candidate from each financial outcome.',
  },
  {
    id: 'reliable',
    label: 'Most reliable',
    description: 'Highest measured response rates, with probe depth breaking ties.',
  },
  {
    id: 'recent',
    label: 'Recently measured',
    description: 'Agents whose evidence record changed most recently.',
  },
];

function responseRate(entry: Entry): number {
  if (entry.record.totalProbes === 0) return -1;
  return entry.record.totalAnswered / entry.record.totalProbes;
}

function recommended(entries: Entry[]): Entry[] {
  return CATEGORIES.map(({ id }) => {
    const ranked = entries
      .filter((entry) => entry.listing.category === id)
      .sort((a, b) => {
        const direct = Number(offersDirectHire(b)) - Number(offersDirectHire(a));
        if (direct !== 0) return direct;
        const quoted = Number(b.listing.quote != null) - Number(a.listing.quote != null);
        if (quoted !== 0) return quoted;
        return b.record.totalAnswered - a.record.totalAnswered;
      });
    return ranked[0] ?? null;
  }).filter((entry): entry is Entry => entry !== null);
}

function rankedFor(tab: Spotlight, entries: Entry[]): Entry[] {
  if (tab === 'recommended') return recommended(entries);

  return [...entries]
    .sort((a, b) => {
      if (tab === 'reliable') {
        const rate = responseRate(b) - responseRate(a);
        if (rate !== 0) return rate;
        return b.record.totalProbes - a.record.totalProbes;
      }

      const aSeen = a.record.lastSeen ? Date.parse(a.record.lastSeen) : 0;
      const bSeen = b.record.lastSeen ? Date.parse(b.record.lastSeen) : 0;
      if (bSeen !== aSeen) return bSeen - aSeen;
      return b.record.totalProbes - a.record.totalProbes;
    })
    .slice(0, 4);
}

/** The first marketplace surface: three explicit, evidence-only ranking views. */
export function HireableNow({ entries }: { entries: Entry[] }) {
  const [active, setActive] = useState<Spotlight>('recommended');
  const eligible = useMemo(
    () => entries.filter((entry) => isPromotableAgent(entry.listing.agent)),
    [entries],
  );
  const picks = useMemo(() => rankedFor(active, eligible), [active, eligible]);

  if (picks.length === 0) return null;

  const priced = eligible.filter((entry) => entry.listing.quote != null).length;
  const activeTab = TABS.find((tab) => tab.id === active) ?? TABS[0];

  return (
    <section className="flex flex-col gap-5" aria-labelledby="agent-spotlight-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-xl flex-col gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--brand)]">
            Agent spotlight
          </p>
          <h2 id="agent-spotlight-heading" className="font-[family-name:var(--font-serif)] text-2xl sm:text-3xl">
            Start with agents we can observe.
          </h2>
          <p className="text-xs leading-relaxed text-[color:var(--text-muted)]">
            {activeTab.description}
          </p>
        </div>
        <Link href="/agents" className="text-[12px] font-medium text-[color:var(--info)] underline decoration-dotted underline-offset-2">
          Explore all {entries.length} agents →
        </Link>
      </div>

      <div role="tablist" aria-label="Agent spotlight ranking" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            aria-controls="agent-spotlight-panel"
            onClick={() => setActive(tab.id)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-[11px] font-medium transition-colors sm:text-xs ${active === tab.id ? 'bg-[color:var(--surface-raised)] text-[color:var(--text)] shadow-sm' : 'text-[color:var(--text-muted)] hover:text-[color:var(--text)]'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id="agent-spotlight-panel" role="tabpanel" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {picks.map((entry) => (
          <AgentCard
            key={`${active}:${entry.listing.agent.chain_id}:${entry.listing.agent.token_id}`}
            listing={entry.listing}
            verdict={verdictFor(entry)}
            record={entry.record}
            hirable={offersDirectHire(entry)}
          />
        ))}
      </div>

      <p className="text-[11px] text-[color:var(--text-faint)]">
        Rankings use observed availability and published marketplace terms—not promised returns.{' '}
        {priced} of {eligible.length} eligible agents currently have a signed price.
      </p>
    </section>
  );
}
