import Link from 'next/link';

import type { Listing } from '@/lib/marketplace';
import { VerdictBadge } from './VerdictBadge';

/**
 * List rows carry only a feedback count, not a full proof summary — computing
 * that per card would mean a request per agent. An agent with no attestations
 * is unproven with certainty, which is the judgement the card needs to make.
 */
function listVerdict(attestationCount: number) {
  return attestationCount === 0 ? ('unproven' as const) : ('emerging' as const);
}

export function AgentCard({ listing }: { listing: Listing }) {
  const { agent, attestationCount } = listing;
  const verdict = listVerdict(attestationCount);
  const unproven = verdict === 'unproven';

  return (
    <Link
      href={`/agent/${agent.chain_id}/${agent.token_id}`}
      className="group flex h-full flex-col gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 transition hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-raised)]"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-sm font-medium leading-snug text-[color:var(--foreground)] decoration-[color:var(--muted-dim)] underline-offset-4 group-hover:underline">
          {agent.name}
        </h3>
        <span className="shrink-0">
          <VerdictBadge verdict={verdict} />
        </span>
      </div>

      <p className="line-clamp-3 text-xs leading-relaxed text-[color:var(--muted)]">
        {agent.description?.trim() || 'No description published.'}
      </p>

      <div className="mt-auto flex items-center justify-between border-t border-[color:var(--border)] pt-3 text-[11px] text-[color:var(--muted-dim)]">
        <span className="tabular">
          {unproven
            ? 'No attestations'
            : `${attestationCount} attestation${attestationCount === 1 ? '' : 's'}`}
        </span>
        <span className="tabular">
          {(agent.supported_protocols ?? []).slice(0, 2).join(' · ') || 'no protocol'}
        </span>
      </div>
    </Link>
  );
}
