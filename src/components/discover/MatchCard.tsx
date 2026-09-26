import Link from 'next/link';

import { cn } from '@/lib/ui/cn';
import { formatPercent } from '@/lib/ui/format';
import { ScoreBadge } from '@/components/ui/Score';
import type { Match } from '@/lib/recommend/types';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { CATEGORY_BY_ID } from '@/lib/agents/categories';

/**
 * A matched agent. The recommended one is rendered larger with its full
 * reasoning; alternatives use the same component in a compact form so they are
 * visibly comparable rather than visibly demoted.
 */
export function MatchCard({
  match,
  primary = false,
}: {
  match: Match;
  primary?: boolean;
}) {
  const { listing, record, score, reasons, tradeoffs } = match;
  const category = CATEGORY_BY_ID.get(listing.category);
  const uptime =
    record.totalProbes === 0 ? null : record.totalAnswered / record.totalProbes;

  return (
    <article
      className={cn(
        'relative flex flex-col gap-4 overflow-hidden rounded-[var(--radius-lg)] border bg-[color:var(--surface)] p-5',
        primary
          ? 'border-[color:var(--brand)] shadow-[inset_3px_0_0_var(--brand)]'
          : 'border-[color:var(--border)]',
      )}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <AgentAvatar
            name={listing.agent.name}
            src={listing.agent.image_url}
            size="sm"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {primary && (
                <span className="w-fit rounded-full bg-[color:var(--brand-highlight-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">
                  Best match
                </span>
              )}
              {category && (
                <span className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">
                  {category.label}
                </span>
              )}
            </div>
            <h3
              title={listing.agent.name}
              className={cn(
                'font-medium leading-snug [overflow-wrap:anywhere]',
                primary ? 'text-lg' : 'line-clamp-2 text-sm',
              )}
            >
              {listing.agent.name}
            </h3>
            <p className="line-clamp-2 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
              {listing.agent.description ?? 'No description published.'}
            </p>
          </div>
        </div>
        <ScoreBadge score={score} />
      </header>

      <dl className="grid grid-cols-3 gap-3 border-y border-[color:var(--border)] py-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
            Uptime
          </dt>
          <dd className="tabular text-sm">{formatPercent(uptime)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
            Probes
          </dt>
          <dd className="tabular text-sm">{record.totalProbes}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
            Fit
          </dt>
          <dd className="tabular text-sm">{formatPercent(match.fit, { decimals: 0 })}</dd>
        </div>
      </dl>

      {primary && reasons.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {reasons.map((reason) => (
            <li
              key={reason}
              className="flex gap-2 text-[11px] leading-relaxed text-[color:var(--text-secondary)]"
            >
              <span aria-hidden className="text-[color:var(--positive)]">
                ✓
              </span>
              {reason}
            </li>
          ))}
        </ul>
      )}

      {primary && tradeoffs.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {tradeoffs.map((tradeoff) => (
            <li
              key={tradeoff}
              className="flex gap-2 text-[11px] leading-relaxed text-[color:var(--text-muted)]"
            >
              <span aria-hidden className="text-[color:var(--caution)]">
                ⚠
              </span>
              {tradeoff}
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/agents/${listing.agent.chain_id}/${listing.agent.token_id}`}
        className={cn(
          'w-fit rounded-[var(--radius)] px-3 py-1.5 text-[13px] font-medium transition-colors',
          primary
            ? 'action-primary'
            : 'border border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)]',
        )}
      >
        {primary ? 'Review recommendation' : 'Review agent'}
      </Link>
    </article>
  );
}
