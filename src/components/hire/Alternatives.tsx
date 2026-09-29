import Link from 'next/link';

import type { Alternative } from '@/lib/marketplace';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { AgentAvatar } from '@/components/agent/AgentAvatar';

/**
 * Safer same-category options shown before a user accepts a high-risk hire.
 *
 * FE-01. The refusal is the product working; the empty screen after it was
 * not. These are same-category agents with a record of answering, ranked by
 * that record.
 *
 * The heading says "recently" on purpose. These were chosen from accumulated
 * probes rather than a fresh one, so the honest claim is that they have been
 * answering — not that they will answer the moment you click.
 */
export function Alternatives({
  alternatives,
  category,
}: {
  alternatives: Alternative[];
  category: string;
}) {
  const meta = CATEGORY_BY_ID.get(category as never);

  if (alternatives.length === 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-5">
        <h2 className="text-sm font-medium">No alternative to offer</h2>
        <p className="mt-1.5 max-w-2xl text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          Nothing else in {meta?.label ?? 'this category'} has answered a probe
          recently either. That is a fact about the category rather than a gap
          in the page — browsing{' '}
          <Link href="/agents" className="underline underline-offset-2">
            every agent
          </Link>{' '}
          will show the same evidence.
        </p>
      </section>
    );
  }

  return (
    /*
      Framed as a recommendation, not a footnote.
      
      This section appears only when the page has just told someone the agent
      they chose carries added risk. It was three flat cards below the funding
      form, lighter than any card on the marketplace, so the safer option was
      the least visible thing on the screen at the moment it mattered most.
    */
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--info)]/30 bg-[color:var(--info-dim)] p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--info)]">
          Stronger alternatives
        </p>
        <h2 className="text-base font-medium tracking-tight">
          {meta?.label ?? 'Same category'} agents that have been answering
        </h2>
        <p className="max-w-2xl text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
          Ranked by the share of probes each one answered. Read from the
          accumulated record rather than a fresh probe, so the honest claim is
          that they have been answering — not that they will answer the moment
          you click.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {alternatives.map(({ listing, verdict, answered, probes }) => {
          const rate = probes > 0 ? answered / probes : null;
          const href = `/agents/${listing.agent.chain_id}/${listing.agent.token_id}`;

          return (
            <li key={listing.agent.token_id}>
              <Link
                href={href}
                className="group flex h-full flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 transition-[border-color,box-shadow] hover:border-[color:var(--brand)] hover:shadow-md"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-start gap-2.5">
                    <AgentAvatar
                      name={listing.agent.name}
                      src={listing.agent.image_url}
                      size="sm"
                    />
                    <span
                      title={listing.agent.name}
                      className="line-clamp-2 text-[13px] font-medium leading-snug [overflow-wrap:anywhere]"
                    >
                      {listing.agent.name}
                    </span>
                  </span>
                  <EvidenceBadge verdict={verdict} />
                </span>

                {/*
                  The reason it is here, drawn as well as written. Three cards
                  of "97.2% of 288 probes" is a row of numbers to compare by
                  hand; the bar makes the ranking legible at a glance.
                */}
                {rate !== null && (
                  <span className="flex flex-col gap-1.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="tabular text-[15px] font-semibold text-[color:var(--positive)]">
                        {(rate * 100).toFixed(1)}%
                      </span>
                      <span className="tabular text-[10px] text-[color:var(--text-faint)]">
                        {probes} probes
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="h-1.5 overflow-hidden rounded-full bg-[color:var(--bg-subtle)]"
                    >
                      <span
                        className="block h-full rounded-full bg-[color:var(--positive)]"
                        style={{ width: `${Math.max(2, rate * 100)}%` }}
                      />
                    </span>
                  </span>
                )}

                <span className="mt-auto text-[11px] font-medium text-[color:var(--text-muted)] group-hover:text-[color:var(--text)]">
                  Review this one instead →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
