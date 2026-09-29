import Link from 'next/link';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import type { Listing } from '@/lib/marketplace';
import type { Verdict } from '@/lib/proof/engine';
import type { TrackRecord } from '@/lib/history/record';
import { shortAddress } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
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
  record,
  hirable = false,
}: {
  listing: Listing;
  verdict: Verdict;
  /**
   * What our sweeps have accumulated. The card previously showed the agent's
   * declared protocols — "A2A" — which is jargon that answers none of the
   * questions someone scanning a marketplace is actually asking.
   */
  record?: TrackRecord;
  /** Offer Hire on the card itself. See `offersDirectHire`. */
  hirable?: boolean;
}) {
  const { agent, attestationCount } = listing;
  const meta = CATEGORY_BY_ID.get(listing.category);
  const href = `/agents/${agent.chain_id}/${agent.token_id}`;
  /*
   * What the agent charges, or an admission that we do not know.
   *
   * Every card used to print the same 0.10 $U, which was not a price at all
   * but Pokter's default escrow budget. Read across a grid it said every
   * agent costs the same — a claim nobody made and which is not true.
   *
   * A price exists only inside a signed quote the agent gives when asked, so
   * there are three states and the card distinguishes all of them: a price we
   * hold, an agent that has been asked and would not name one, and an agent
   * we have not yet asked.
   */
  const priceLabel =
    listing.quote === undefined
      ? 'Price not yet asked'
      : listing.quote === null
        ? 'No price quoted'
        : formatQuotedPrice(listing.quote.priceU);
  const hasPrice = Boolean(listing.quote);

  const hireHref = `/hire/${agent.chain_id}/${agent.token_id}`;
  const description = agent.description?.trim() || 'No description published.';

  const attestations =
    attestationCount === 0
      ? 'No attestations'
      : `${attestationCount} attestation${attestationCount === 1 ? '' : 's'}`;

  /*
   * The card answers five questions and no more: what does it do, can I
   * trust it, is it answering, what does it cost, can I hire it. Availability
   * is the third of those, and it is the one the old footer spent its space
   * not answering.
   */
  const availability =
    record && record.totalProbes > 0
      ? `${Math.round((record.totalAnswered / record.totalProbes) * 100)}% of ${record.totalProbes} probes`
      : 'Not yet probed';

  /* An owner is a publisher. Shown short, because the full word is an address. */
  const publisher = agent.owner_address
    ? shortAddress(agent.owner_address)
    : null;

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
      <div className="surface-card relative flex min-w-0 flex-col md:hidden">
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
        <div className="flex flex-col gap-2 border-t border-[color:var(--border)] px-3 py-2.5">
          <p className="tabular min-w-0 truncate text-[11px] text-[color:var(--text-faint)]">
            {publisher ? `${publisher} · ` : ''}
            {availability}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'tabular min-w-0 truncate text-[12px]',
                hasPrice
                  ? 'font-medium'
                  : 'text-[11px] text-[color:var(--text-faint)]',
              )}
            >
              {priceLabel}
            </span>
            {hirable ? (
              <Link
                href={hireHref}
                className="action-primary flex shrink-0 items-center justify-center rounded-[var(--radius)] px-3.5 text-[12px] font-medium"
              >
                Hire agent
              </Link>
            ) : (
              <span className="text-[11px] text-[color:var(--text-faint)]">
                {attestations}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Desktop, unchanged ────────────────────────────────────────── */}
      <div className="surface-card group relative hidden h-full min-w-0 flex-col md:flex">
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

          <dl className="mt-auto flex flex-col gap-1 border-t border-[color:var(--border)] pt-3 text-[11px] text-[color:var(--text-faint)]">
            <div className="flex items-baseline justify-between gap-3">
              {/*
                These labels are `sr-only`, which is `position: absolute`. With
                no positioned ancestor their containing block is the document,
                so a card sitting inside a horizontally scrolled strip placed
                them a thousand pixels past the viewport and stretched the page
                itself — the whole layout slid sideways on any agent page whose
                similar-agents row was long enough to scroll. The `relative` on
                the card root is what keeps them inside it.
              */}
              <dt className="sr-only">Publisher</dt>
              <dd className="min-w-0 truncate">{publisher ?? 'Owner unknown'}</dd>
              <dt className="sr-only">Attestations</dt>
              <dd className="tabular shrink-0">{attestations}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="sr-only">Availability</dt>
              <dd className="tabular min-w-0 truncate">{availability}</dd>
              <dt className="sr-only">Price</dt>
              <dd
                className={cn(
                  'tabular shrink-0',
                  hasPrice
                    ? 'font-medium text-[color:var(--text-secondary)]'
                    : 'text-[color:var(--text-faint)]',
                )}
              >
                {priceLabel}
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
