import Link from 'next/link';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import type { Listing } from '@/lib/marketplace';
import { EvidenceBadge } from './ui/EvidenceBadge';

/**
 * §19. The marketplace card.
 *
 * Kept deliberately thin: the list view answers "is this worth opening?", and
 * everything else belongs on the detail page. The evidence state is derived
 * from attestation count alone here, because computing a full proof per card
 * would mean one request per agent — and an agent with no attestations is
 * unproven with certainty regardless.
 */
export function AgentCard({ listing }: { listing: Listing }) {
  const { agent, attestationCount } = listing;
  const verdict = attestationCount === 0 ? 'unproven' : 'emerging';
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
          <h3 className="break-words text-sm font-medium leading-snug">
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
