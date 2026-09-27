import Link from 'next/link';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import type { Listing } from '@/lib/marketplace';
import type { Verdict } from '@/lib/proof/engine';
import { AgentAvatar } from './agent/AgentAvatar';
import { EvidenceBadge } from './ui/EvidenceBadge';

/**
 * §19. The marketplace card.
 *
 * Two arrangements of the same facts. The phone list was 11.2 screens for 32
 * agents, with only two cards above the fold, because the desktop card stacks
 * a three-line description over two separate footer rows. On a phone those
 * become one line and one row.
 *
 * The split is layout only: what each arrangement says is built once, below,
 * so the two can go out of alignment on spacing but never on facts. Desktop
 * renders exactly the markup it did before.
 */
export function AgentCard({
  listing,
  verdict,
  hirable = false,
}: {
  listing: Listing;
  verdict: Verdict;
  /** Offer Hire on the card itself. See `offersDirectHire`. */
  hirable?: boolean;
}) {
  const { agent, attestationCount } = listing;
  const meta = CATEGORY_BY_ID.get(listing.category);
  const protocols = agent.supported_protocols ?? [];
  const href = `/agents/${agent.chain_id}/${agent.token_id}`;
  const hireHref = `/hire/${agent.chain_id}/${agent.token_id}`;
  const description = agent.description?.trim() || 'No description published.';

  const attestations =
    attestationCount === 0
      ? 'No attestations'
      : `${attestationCount} attestation${attestationCount === 1 ? '' : 's'}`;

  /*
    FE-08. break-words alone let `mandaterebalance-agent` split as
    `mandaterebala / nce-agent`, and three-line titles made card heights
    disagree across a row. Clamped to two lines with the full name kept in the
    tooltip — these are identifiers, not prose.
  */
  const name = (
    <h3
      title={agent.name}
      className="line-clamp-2 break-words text-sm font-medium leading-snug [overflow-wrap:anywhere]"
    >
      {agent.name}
    </h3>
  );

  return (
    <>
      {/* ── Phone ─────────────────────────────────────────────────────── */}
      {/*
        `min-w-0` because a grid item defaults to `min-width: auto`, so it
        refuses to shrink below its content's minimum. One agent whose
        description holds an unbreakable token was enough to push the card
        374px wide inside a 350px column and give the whole page a horizontal
        scroll — latent until a higher list limit surfaced that agent.
      */}
      <div className="flex min-w-0 flex-col rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] md:hidden">
        <Link href={href} className="flex flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2.5">
              <AgentAvatar name={agent.name} src={agent.image_url} size="sm" />
              <div className="flex min-w-0 flex-col gap-0.5">
                {meta && (
                  <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                    {meta.label}
                  </span>
                )}
                {name}
              </div>
            </div>
            <EvidenceBadge verdict={verdict} />
          </div>

          {/*
            One line. At three it was the tallest part of the card, and the
            registry text runs into operator endpoints — a raw URL is not what
            anyone is scanning a marketplace for.
          */}
          <p className="line-clamp-1 break-words text-xs leading-relaxed text-[color:var(--text-muted)] [overflow-wrap:anywhere]">
            {description}
          </p>
        </Link>

        {/*
          Evidence and the action share one row here rather than stacking as
          two, which is most of the height difference.
        */}
        <div className="flex items-center justify-between gap-2 border-t border-[color:var(--border)] px-3 py-2">
          <span className="tabular min-w-0 truncate text-[11px] text-[color:var(--text-faint)]">
            {attestations}
          </span>
          {hirable ? (
            <Link
              href={hireHref}
              className="action-primary flex shrink-0 items-center justify-center rounded-[var(--radius)] px-3.5 text-[12px] font-medium"
            >
              Hire agent
            </Link>
          ) : (
            <span className="mono shrink-0 text-[11px] text-[color:var(--text-faint)]">
              {protocols.slice(0, 2).join(' · ') || 'no endpoint'}
            </span>
          )}
        </div>
      </div>

      {/* ── Desktop, unchanged ────────────────────────────────────────── */}
      <div className="group hidden h-full min-w-0 flex-col rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] transition-colors hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface-hover)] md:flex">
        <Link href={href} className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <AgentAvatar name={agent.name} src={agent.image_url} size="sm" />
              <div className="flex min-w-0 flex-col gap-1">
                {meta && (
                  <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                    {meta.label}
                  </span>
                )}
                {name}
              </div>
            </div>
            <EvidenceBadge verdict={verdict} />
          </div>

          <p className="line-clamp-3 break-words text-xs leading-relaxed text-[color:var(--text-muted)] [overflow-wrap:anywhere]">
            {description}
          </p>

          <dl className="mt-auto flex items-center justify-between border-t border-[color:var(--border)] pt-3 text-[11px] text-[color:var(--text-faint)]">
            <div className="flex items-baseline gap-1.5">
              <dt className="sr-only">Attestations</dt>
              <dd className="tabular">{attestations}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="sr-only">Protocols</dt>
              <dd className="mono">
                {protocols.slice(0, 2).join(' · ') || 'no endpoint'}
              </dd>
            </div>
          </dl>
        </Link>

        {/*
          Hire from the list, where the decision is actually being made.
          Browsing used to mean card → detail → hire, and the detail page's own
          button sat at the fold on a phone, so the action was effectively
          hidden twice. Shown only where the record supports it.
        */}
        {hirable && (
          <div className="border-t border-[color:var(--border)] px-4 py-3">
            <Link
              href={hireHref}
              className="action-primary flex w-full items-center justify-center rounded-[var(--radius)] px-3 py-2 text-[12px] font-medium"
            >
              Hire agent
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
