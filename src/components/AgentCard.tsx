import Link from 'next/link';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import type { Listing } from '@/lib/marketplace';
import type { Verdict } from '@/lib/proof/engine';
import { EvidenceBadge } from './ui/EvidenceBadge';

/**
 * §19. The marketplace card.
 *
 * Kept deliberately thin: the list view answers "is this worth opening?", and
 * everything else belongs on the detail page. The evidence state is supplied
 * by the list-level evidence model so search filters, cards and detail pages do
 * not contradict one another.
 */
export function AgentCard({
  listing,
  verdict,
}: {
  listing: Listing;
  verdict: Verdict;
}) {
  const { agent, attestationCount } = listing;
  const meta = CATEGORY_BY_ID.get(listing.category);
  const protocols = agent.supported_protocols ?? [];

  return (
    <Link
      href={`/agents/${agent.chain_id}/${agent.token_id}`}
      className="group flex h-full flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 transition-colors hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {meta && (
            <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
              {meta.label}
            </span>
          )}
          {/*
            FE-08. break-words alone let `mandaterebalance-agent` split as
            `mandaterebala / nce-agent`, and three-line titles made card
            heights disagree across a row. Clamped to two lines with the full
            name kept in the tooltip — these are identifiers, not prose.
          */}
          <h3
            title={agent.name}
            className="line-clamp-2 break-words text-sm font-medium leading-snug [overflow-wrap:anywhere]"
          >
            {agent.name}
          </h3>
        </div>
        <EvidenceBadge verdict={verdict} />
      </div>

      <p className="line-clamp-3 text-xs leading-relaxed text-[color:var(--text-muted)]">
        {agent.description?.trim() || 'No description published.'}
      </p>

      <dl className="mt-auto flex items-center justify-between border-t border-[color:var(--border)] pt-3 text-[11px] text-[color:var(--text-faint)]">
        <div className="flex items-baseline gap-1.5">
          <dt className="sr-only">Attestations</dt>
          <dd className="tabular">
            {attestationCount === 0
              ? 'No attestations'
              : `${attestationCount} attestation${attestationCount === 1 ? '' : 's'}`}
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="sr-only">Protocols</dt>
          <dd className="mono">{protocols.slice(0, 2).join(' · ') || 'no endpoint'}</dd>
        </div>
      </dl>
    </Link>
  );
}
