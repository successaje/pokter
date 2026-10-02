'use client';

import Link from 'next/link';
import { useState } from 'react';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { CATEGORIES, type Category } from '@/lib/agents/categories';
import { isPromotableAgent } from '@/lib/agents/eligibility';
import { preferDistinctOwners } from '@/lib/agents/diversity';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import type { TrackRecord } from '@/lib/history/record';
import type { Listing } from '@/lib/marketplace';

type Entry = { listing: Listing; record: TrackRecord };

/*
 * Named for what arrives, not for what a buyer wishes would happen.
 *
 * These read "Monitor risk — act before liquidation", "Earn yield — put idle
 * capital to work", "Stay allocated", "Execute a plan". Every one of them
 * describes an agent doing something continuous to your money. Nothing here
 * does: each agent answers once when hired, returns a written assessment,
 * and cannot touch a wallet. The tile was the loudest promise on the page
 * and the furthest from the product.
 */
const OUTCOMES: Record<Category, { verb: string; short: string; icon: string }> = {
  yield: { verb: 'Compare yields', short: 'Where capital would earn more', icon: '↗' },
  'health-factor': { verb: 'Check liquidation risk', short: 'How close a loan is', icon: '⌁' },
  rebalancing: { verb: 'Check drift', short: 'How far weights have moved', icon: '◫' },
  'grid-trading': { verb: 'Review a range', short: 'Whether it still fits the market', icon: '⌗' },
};

function evidenceRate(entry: Entry): number {
  return entry.record.totalProbes === 0
    ? -1
    : entry.record.totalAnswered / entry.record.totalProbes;
}

/**
 * The three agents an outcome tab offers.
 *
 * Exported and pure so it can be tested. This ordering broke once already —
 * ranking on answer rate with probe count as the tiebreak filled the yield
 * shelf with three listings by one publisher, none of which had ever named a
 * price, so a doorway labelled "earn yield" offered nothing anyone could buy
 * while the two agents that had signed a price sat underneath them for having
 * been probed fewer times. A rule that decides what a marketplace puts on its
 * front page should not be a sort buried in a render.
 *
 * Price leads because it is the difference between an agent you can hire and
 * one you can only look at. Owner diversity is applied last, because one
 * publisher holds eighteen of the eighty listings and would otherwise take
 * the whole shelf.
 */
export function outcomeShortlist(entries: Entry[], category: Category): Entry[] {
  const ranked = entries
    .filter(
      (entry) =>
        entry.listing.category === category &&
        isPromotableAgent(entry.listing.agent),
    )
    .sort((a, b) => {
      const quoted =
        Number(b.listing.quote != null) - Number(a.listing.quote != null);
      if (quoted !== 0) return quoted;
      const rate = evidenceRate(b) - evidenceRate(a);
      if (rate !== 0) return rate;
      return b.record.totalProbes - a.record.totalProbes;
    });

  return preferDistinctOwners(ranked, 3);
}

/** An outcome-first doorway into the full catalogue, without duplicating Discover. */
export function BrowseByOutcome({ entries }: { entries: Entry[] }) {
  const [active, setActive] = useState<Category>('yield');
  const category = CATEGORIES.find((candidate) => candidate.id === active) ?? CATEGORIES[0];
  const outcome = OUTCOMES[active];
  const shortlist = outcomeShortlist(entries, active);

  return (
    <section className="flex flex-col gap-5" aria-labelledby="browse-outcome-heading">
      <div className="max-w-2xl">
        <h2 id="browse-outcome-heading" className="font-[family-name:var(--font-serif)] text-2xl sm:text-3xl">
          Begin with the job, not the protocol.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-muted)]">
          Choose what you want handled. Pokter turns that intent into a smaller, evidence-ranked set.
        </p>
      </div>

      <div className="motion-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="tablist" aria-label="Financial outcomes">
        {CATEGORIES.map((item) => {
          const meta = OUTCOMES[item.id];
          const selected = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="outcome-panel"
              onClick={() => setActive(item.id)}
              className={`group flex min-h-28 flex-col items-start justify-between rounded-2xl border p-4 text-left transition-all duration-200 ${selected ? 'border-[color:var(--brand)] bg-[color:var(--brand)]/8 shadow-sm' : 'border-[color:var(--border)] bg-[color:var(--surface)] hover:-translate-y-0.5 hover:border-[color:var(--border-strong)]'}`}
            >
              <span className="flex w-full items-start justify-between gap-3">
                <span className={`grid size-8 place-items-center rounded-xl text-sm ${selected ? 'bg-[color:var(--brand)] text-[color:var(--brand-ink)]' : 'bg-[color:var(--bg-subtle)] text-[color:var(--text-muted)]'}`}>
                  {meta.icon}
                </span>
                <span className="text-[11px] text-[color:var(--text-faint)]">Explore →</span>
              </span>
              <span className="mt-4 flex flex-col">
                <span className="text-sm font-semibold">{meta.verb}</span>
                <span className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">{meta.short}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div id="outcome-panel" role="tabpanel" className="overflow-hidden rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--bg-subtle)]">
        <div className="grid lg:grid-cols-[0.72fr_1.28fr]">
          <div className="flex flex-col justify-between gap-8 border-b border-[color:var(--border)] p-5 sm:p-7 lg:border-b-0 lg:border-r">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--brand)]">{outcome.verb}</span>
              <h3 className="mt-2 font-[family-name:var(--font-serif)] text-2xl">{category.blurb}</h3>
              <p className="mt-3 text-xs leading-relaxed text-[color:var(--text-muted)]">The decision question: {category.question}</p>
            </div>
            <Link href={`/agents?q=${encodeURIComponent(`tag:${active}`)}`} className="action-primary flex w-fit items-center justify-center rounded-[var(--radius)] px-4 py-2.5 text-xs font-semibold">
              See all {category.label.toLowerCase()} agents →
            </Link>
          </div>

          <div className="motion-stagger divide-y divide-[color:var(--border)] bg-[color:var(--surface)]">
            {shortlist.length > 0 ? shortlist.map((entry) => {
              const { agent } = entry.listing;
              const uptime = evidenceRate(entry);
              return (
                <Link key={`${agent.chain_id}:${agent.token_id}`} href={`/agents/${agent.chain_id}/${agent.token_id}`} className="group flex items-center gap-3 p-4 transition-colors hover:bg-[color:var(--surface-hover)] sm:px-6">
                  <AgentAvatar name={agent.name} src={agent.image_url} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{agent.name}</span>
                    <span className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">{entry.record.totalProbes > 0 ? `${Math.round(uptime * 100)}% across ${entry.record.totalProbes} probes` : 'Not measured yet'}</span>
                  </span>
                  <span className="hidden text-right sm:flex sm:flex-col">
                    <span className="text-xs font-medium">{entry.listing.quote ? formatQuotedPrice(entry.listing.quote.priceU) : 'No signed price'}</span>
                    <span className="text-[10px] text-[color:var(--text-faint)]">View evidence</span>
                  </span>
                  <span className="text-sm text-[color:var(--text-faint)] transition-transform group-hover:translate-x-0.5">→</span>
                </Link>
              );
            }) : (
              <div className="flex min-h-52 items-center justify-center p-6 text-center text-sm text-[color:var(--text-muted)]">No production-ready candidates are indexed in this outcome yet.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
