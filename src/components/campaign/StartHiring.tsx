import Link from 'next/link';

import { listSearchable } from '@/lib/marketplace';
import { offersDirectHire, verdictFor } from '@/lib/search/match';
import { isPromotableAgent } from '@/lib/agents/eligibility';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { ALTANA_NETWORK } from '@/lib/altana/client';

/** The campaign asks for three different agents. */
const WANTED = 3;

/**
 * Three agents to hire, on the page that asks you to hire three.
 *
 * The task list told people to hire three different agents and then sent
 * them to the catalogue to start again — pick a category, read the
 * evidence, choose. That is the right journey for somebody browsing and
 * the wrong one for somebody working through a checklist, who has already
 * decided to hire and only needs something defensible to hire.
 *
 * Chosen rather than listed: each from a different category and a
 * different publisher, each one Pokter can actually offer a hire button
 * for, ordered by what has been measured. Three different categories
 * because the campaign counts three *different* agents, and taking them
 * from one shelf is the likeliest way to end up with near-duplicates.
 */
export async function StartHiring() {
  const all = await listSearchable({ limit: 30 }).catch(() => []);

  const candidates = all
    .filter((entry) => offersDirectHire(entry))
    .filter((entry) => isPromotableAgent(entry.listing.agent))
    .sort((a, b) => {
      const rate = (x: typeof a) =>
        x.record.totalProbes === 0
          ? -1
          : x.record.totalAnswered / x.record.totalProbes;
      return rate(b) - rate(a) || b.record.totalProbes - a.record.totalProbes;
    });

  /*
   * One per category and one per publisher. Without the publisher rule the
   * same operator can supply all three, and three agents from one wallet
   * is the shape the campaign's own anti-clone language is about.
   */
  const picked: typeof candidates = [];
  const categories = new Set<string>();
  const owners = new Set<string>();

  for (const entry of candidates) {
    if (picked.length === WANTED) break;
    const category = entry.listing.category;
    const owner = entry.listing.agent.owner_address?.toLowerCase() ?? '';
    if (categories.has(category)) continue;
    if (owner && owners.has(owner)) continue;
    categories.add(category);
    if (owner) owners.add(owner);
    picked.push(entry);
  }

  /*
   * Nothing is better than a shelf of excuses. If the catalogue cannot
   * offer a real hire right now, the task list above still links to it.
   */
  if (picked.length === 0) return null;

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-base font-semibold">Start hiring</h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[color:var(--text-muted)]">
            Three agents Pokter can hire for you right now, one from each of
            three categories and no two from the same publisher. A hire
            counts from the moment its escrow event lands on chain.
          </p>
        </div>
        <Link
          href="/agents"
          className="tap shrink-0 text-[12px] font-medium text-[color:var(--info)] underline decoration-dotted underline-offset-2"
        >
          Browse all agents →
        </Link>
      </div>

      <ul className="flex flex-col divide-y divide-[color:var(--border)] rounded-[var(--radius)] border border-[color:var(--border)]">
        {picked.map((entry) => {
          const { agent, quote, category } = entry.listing;
          const meta = CATEGORY_BY_ID.get(category);
          const rate =
            entry.record.totalProbes === 0
              ? null
              : Math.round(
                  (entry.record.totalAnswered / entry.record.totalProbes) * 100,
                );

          return (
            <li
              key={`${agent.chain_id}:${agent.token_id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3"
            >
              <AgentAvatar name={agent.name} src={agent.image_url} size="sm" />

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Link
                  href={`/agents/${agent.chain_id}/${agent.token_id}`}
                  className="truncate text-[13px] font-medium hover:underline"
                >
                  {agent.name}
                </Link>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[color:var(--text-muted)]">
                  {meta?.label}
                  {rate !== null && (
                    <span className="tabular">
                      {`· ${rate}% of ${entry.record.totalProbes} checks`}
                    </span>
                  )}
                  {agent.chain_id === ALTANA_NETWORK.chainId && (
                    <span className="text-[color:var(--info)]">
                      · delivers its own work
                    </span>
                  )}
                </span>
              </div>

              <EvidenceBadge verdict={verdictFor(entry)} />

              <span className="tabular shrink-0 text-[13px] font-semibold">
                {quote ? formatQuotedPrice(quote.priceU) : 'Name a budget'}
              </span>

              <Link
                href={`/hire/${agent.chain_id}/${agent.token_id}`}
                className="action-card shrink-0 rounded-[var(--radius)] px-4 py-2 text-[12px]"
              >
                Hire
              </Link>
            </li>
          );
        })}
      </ul>

      {/*
        The part that decides whether the task completes. Three hires here
        is not three qualifying hires: the rules want them spread across at
        least two shortlisted marketplaces, so one of the three has to
        happen somewhere that is not Pokter. Saying it beside the buttons
        costs a sentence; not saying it costs somebody the entry.
      */}
      <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
        <span className="font-medium text-[color:var(--text)]">
          At least one of your three must be on another shortlisted
          marketplace.
        </span>{' '}
        Three hires on Pokter alone do not complete the task, however good
        the agents are.
      </p>
    </section>
  );
}
