import Link from 'next/link';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import type { Listing } from '@/lib/marketplace';

export const OBJECTIVES: {
  id: string;
  label: string;
  eyebrow: string;
  blurb: string;
  category: Category;
}[] = [
  {
    id: 'earn',
    label: 'Put idle capital to work.',
    eyebrow: 'Earn',
    blurb:
      'Explore agents that compare vaults, lending markets and yield routes, then inspect the evidence behind every recommendation.',
    category: 'yield',
  },
  {
    id: 'trade',
    label: 'Trade with a system, not an impulse.',
    eyebrow: 'Trade',
    blurb:
      'Find agents that plan repeatable price-range strategies and publish enough detail for you to review before committing capital.',
    category: 'grid-trading',
  },
  {
    id: 'protect',
    label: 'See risk before it becomes a liquidation.',
    eyebrow: 'Protect',
    blurb:
      'Compare monitors that watch lending positions, calculate health factors and surface the conditions that require your attention.',
    category: 'health-factor',
  },
  {
    id: 'rebalance',
    label: 'Keep capital where you intended.',
    eyebrow: 'Rebalance',
    blurb:
      'Review agents built to maintain portfolio weights and liquidity ranges, with availability and attestations shown beside the claim.',
    category: 'rebalancing',
  },
];

function AgentComposition({
  listings,
  category,
}: {
  listings: Listing[];
  category: Category;
}) {
  const meta = CATEGORY_BY_ID.get(category);
  const agents = listings.slice(0, 4);

  return (
    <div className="agent-scene relative mx-auto min-h-[290px] w-full max-w-[520px] sm:min-h-[340px]">
      <div
        aria-hidden
        className="absolute inset-x-[8%] top-[12%] h-[72%] -rotate-3 rounded-[2rem] border border-[color:var(--border-strong)] bg-[color:var(--brand-dim)]"
      />
      <div
        aria-hidden
        className="absolute inset-x-[15%] top-[6%] h-[78%] rotate-3 rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--surface-raised)] shadow-sm"
      />

      {agents.map((listing, index) => {
        const positions = [
          'left-[1%] top-[9%] -rotate-6',
          'right-[1%] top-[25%] rotate-6',
          'bottom-[2%] left-[8%] rotate-2',
          'left-[24%] top-[42%] z-20 -rotate-2',
        ];
        const href = `/agents/${listing.agent.chain_id}/${listing.agent.token_id}`;

        return (
          <Link
            key={`${listing.agent.chain_id}:${listing.agent.token_id}`}
            href={href}
            aria-label={`View ${listing.agent.name}`}
            style={{
              // Stagger as a scroll offset: delays are ignored on a view
              // timeline, so each card finishes a little further down instead.
              animationRange: `cover ${18 + index * 6}% cover ${44 + index * 6}%`,
            }}
            className={`agent-deal absolute ${positions[index]} z-10 flex w-[68%] max-w-[310px] items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-3 shadow-lg transition-[transform,border-color,box-shadow] duration-300 hover:z-30 hover:rotate-0 hover:scale-[1.02] hover:border-[color:var(--brand)] hover:shadow-xl focus-visible:z-30 focus-visible:rotate-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] sm:p-4`}
          >
            <AgentAvatar
              name={listing.agent.name}
              src={listing.agent.image_url}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{listing.agent.name}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                {listing.attestationCount > 0
                  ? `${listing.attestationCount} onchain ${listing.attestationCount === 1 ? 'receipt' : 'receipts'}`
                  : 'Registry identity'}
              </p>
            </div>
            <span
              className="size-2 shrink-0 rounded-full bg-[color:var(--positive)]"
              aria-hidden
            />
          </Link>
        );
      })}

      {/*
        The protocol name for this outcome. It was 10px of muted grey on a
        surface chip, which put the one word connecting "Trade with a system"
        to "Grid Trading" below the threshold anyone reads while scanning.
        It now carries the brand, at a size that survives a phone.
      */}
      <p className="absolute bottom-[4%] right-[3%] z-30 inline-flex items-center gap-1.5 rounded-full border border-[color:var(--brand)]/45 bg-[color:var(--brand-highlight-soft)] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--brand-strong)] shadow-md">
        <span className="size-1.5 rotate-45 bg-[color:var(--brand-strong)]" aria-hidden />
        {meta?.label ?? 'Financial agents'}
      </p>
    </div>
  );
}

export function ObjectiveSelector({
  sections,
}: {
  sections: { category: Category; listings: Listing[] }[];
}) {
  const byCategory = new Map(
    sections.map(({ category, listings }) => [category, listings]),
  );

  return (
    <section className="flex flex-col gap-12 sm:gap-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--brand-strong)]">
          Start with the outcome
        </p>
        <h2 className="display mt-3 text-3xl sm:text-5xl">
          What are you trying to do?
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-[color:var(--text-secondary)] sm:text-base">
          You do not need to know the strategy name. Choose the outcome, meet
          the agents built for it, then inspect what Pokter can actually verify.
        </p>
        </div>
        <Link
          href="/agents"
          className="text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
        >
          Browse all agents →
        </Link>
      </div>

      <div className="flex flex-col gap-16 sm:gap-24">
        {OBJECTIVES.map((objective, index) => {
          const reverse = index % 2 === 1;
          const listings = byCategory.get(objective.category) ?? [];

          return (
            <article
              key={objective.id}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
            >
              <div className={reverse ? 'lg:order-2' : undefined}>
                {/*
                  Human word and protocol word together, which is the pairing
                  that teaches. "Trade" alone tells a newcomer what they want;
                  "Grid Trading" alone tells an expert what this is; neither
                  alone connects the two, and this is the one place both
                  readers are looking at the same line.
                */}
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-semibold uppercase tracking-widest">
                  <span className="text-[color:var(--text-faint)]">
                    0{index + 1}
                  </span>
                  <span className="text-[color:var(--brand-strong)]">
                    {objective.eyebrow}
                  </span>
                  <span
                    aria-hidden
                    className="h-3 w-px bg-[color:var(--border-strong)]"
                  />
                  <span className="tracking-[0.08em] text-[color:var(--text-secondary)]">
                    {CATEGORY_BY_ID.get(objective.category)?.label ?? ''}
                  </span>
                </p>
                <h3 className="display mt-3 max-w-xl text-3xl leading-tight sm:text-4xl">
                  {objective.label}
                </h3>
                <p className="mt-4 max-w-lg text-sm leading-relaxed text-[color:var(--text-secondary)] sm:text-base">
                  {objective.blurb}
                </p>
                {/*
                  These counts had their own section further down the page,
                  restating the same four categories in protocol vocabulary.
                  They belong next to the outcome they describe, where the
                  reader is already deciding whether to click.
                */}
                <dl className="mt-5 flex items-baseline gap-5 text-[11px]">
                  <div className="flex items-baseline gap-2">
                    <dt className="text-[color:var(--text-faint)]">Indexed</dt>
                    <dd className="tabular font-medium">{listings.length}</dd>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <dt className="text-[color:var(--text-faint)]">
                      With evidence
                    </dt>
                    <dd className="tabular font-medium">
                      {listings.filter((l) => l.attestationCount > 0).length}
                    </dd>
                  </div>
                </dl>
                <Link
                  href={`/discover?objective=${objective.id}`}
                  className="mt-6 inline-flex items-center gap-3 rounded-[var(--radius)] bg-[color:var(--brand)] px-5 py-2.5 text-[13px] font-semibold text-[color:var(--brand-ink)] transition-transform duration-200 hover:-translate-y-0.5"
                >
                  Explore {objective.eyebrow.toLowerCase()} agents
                  <span aria-hidden>→</span>
                </Link>
              </div>

              <div className={reverse ? 'lg:order-1' : undefined}>
                <AgentComposition
                  listings={listings}
                  category={objective.category}
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
