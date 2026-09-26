import Link from 'next/link';

import type { Alternative } from '@/lib/marketplace';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';

/**
 * Where to go when this agent cannot be hired.
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
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">
          {meta?.label ?? 'Same category'} agents that have been answering
        </h2>
        <p className="text-[11px] text-[color:var(--text-muted)]">
          Ranked by the share of probes each one answered. Checked against the
          accumulated record, not a fresh probe — open one to see its live
          status.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {alternatives.map(({ listing, verdict, answered, probes }) => (
          <li key={listing.agent.token_id}>
            <Link
              href={`/agents/${listing.agent.chain_id}/${listing.agent.token_id}`}
              className="flex h-full flex-col gap-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 transition-colors hover:border-[color:var(--border-strong)]"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-medium leading-snug">
                  {listing.agent.name}
                </span>
                <EvidenceBadge verdict={verdict} />
              </span>
              <span className="tabular mt-auto text-[11px] text-[color:var(--text-muted)]">
                {((answered / probes) * 100).toFixed(1)}% of {probes} probes
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
