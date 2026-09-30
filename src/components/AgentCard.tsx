import Link from 'next/link';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import type { Listing } from '@/lib/marketplace';
import type { Verdict } from '@/lib/proof/engine';
import type { TrackRecord } from '@/lib/history/record';
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
  fleetSize,
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
  /**
   * How many listings this publisher holds across the catalogue.
   *
   * Stated rather than collapsed. Nine near-identical registrations from one
   * operator is a fact about this marketplace worth a reader knowing — it
   * changes how much a strong record here means — and hiding it would make the
   * catalogue tidier at the cost of the count being true.
   */
  fleetSize?: number;
}) {
  const { agent, attestationCount } = listing;
  const meta = CATEGORY_BY_ID.get(listing.category);
  const href = `/agents/${agent.chain_id}/${agent.token_id}`;
  /*
   * Whether it is answering now, not just how it has done overall.
   *
   * The evidence badge is a verdict on an accumulated record, so an agent that
   * answered hundreds of probes over a month and then went down still reads
   * "Emerging" — accurate about the history, and the opposite of what someone
   * about to hire it needs to know. The detail page said "Live check failed"
   * right beside that badge; the card, where people actually choose, said
   * nothing.
   *
   * Taken from the 24h window rather than a fresh call, because a browse grid
   * cannot probe eighty endpoints to render. It is a narrower claim — recently,
   * not right now — so the label says recently.
   */
  /*
   * "Hire agent" on an agent that has never named a price.
   *
   * Only eight of eighty listings return a signed quote, yet forty-three
   * carried this button, and the flow behind it then asks the buyer to invent
   * a budget for work nobody has priced. Funding escrow that way is a real
   * action, not a dead end, so the button stays — but the verb changes, because
   * "hire" implies an agreed transaction and this is an offer into silence.
   */
  const quoted = listing.quote != null;

  const recent = record?.windows.find((window) => window.label === '24h');
  const downRecently = recent !== undefined && recent.probes > 0 && recent.ratio === 0;
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
      ? 'Not asked'
      : listing.quote === null
        ? 'No price quoted'
        : formatQuotedPrice(listing.quote.priceU);
  const hasPrice = Boolean(listing.quote);
  const fromAFleet = (fleetSize ?? 1) > 1;

  const hireHref = `/hire/${agent.chain_id}/${agent.token_id}`;
  const description = agent.description?.trim() || 'No description published.';

  const attestations =
    attestationCount === 0 ? null : `${attestationCount} att`;

  /*
   * The card answers five questions and no more: what does it do, can I
   * trust it, is it answering, what does it cost, can I hire it. Availability
   * is the third of those, and it is the one the old footer spent its space
   * not answering.
   */
  const availability =
    record && record.totalProbes > 0
      ? `${Math.round((record.totalAnswered / record.totalProbes) * 100)}% of ${record.totalProbes} probes`
      : 'Unprobed';

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
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                      {meta.label}
                    </span>
                    {fromAFleet && (
                      /*
                        Twenty-five characters to carry one number, wrapping to
                        a second line on a card whose own name often already
                        does. The stacked mark says "there are more of these"
                        on sight, which is the whole message; the count gives
                        the scale, and the accessible name carries the sentence
                        for anyone who needs it spelled out.
                      */
                      <span
                        title={`One of ${fleetSize} listings by this publisher`}
                        className="inline-flex items-center gap-1 rounded-full bg-[color:var(--bg-subtle)] px-1.5 py-px text-[10px] font-medium tabular-nums text-[color:var(--text-muted)]"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden
                          className="size-3 fill-none stroke-current"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="8" y="8" width="12" height="12" rx="2.5" />
                          <path d="M16 4H6a2 2 0 0 0-2 2v10" />
                        </svg>
                        {fleetSize}
                        <span className="sr-only">
                          {' '}
                          listings by this publisher
                        </span>
                      </span>
                    )}
                  </span>
                )}
                {name}
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1.5">
              {downRecently && (
                <span
                  title="Answered no probes in the last 24 hours"
                  className="rounded-full border border-[color:var(--negative)]/35 bg-[color:var(--negative-dim)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--negative)]"
                >
                  Not answering
                </span>
              )}
              <EvidenceBadge verdict={verdict} />
            </span>
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
          {/* Same cut as the desktop footer: the address was never the
              reason anyone picked one of these. */}
          <p className="tabular min-w-0 truncate text-[11px] text-[color:var(--text-faint)]">
            {availability}
            {attestations ? ` · ${attestations}` : ''}
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
                {quoted ? 'Hire agent' : 'Offer a budget'}
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
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                      {meta.label}
                    </span>
                    {fromAFleet && (
                      /*
                        Twenty-five characters to carry one number, wrapping to
                        a second line on a card whose own name often already
                        does. The stacked mark says "there are more of these"
                        on sight, which is the whole message; the count gives
                        the scale, and the accessible name carries the sentence
                        for anyone who needs it spelled out.
                      */
                      <span
                        title={`One of ${fleetSize} listings by this publisher`}
                        className="inline-flex items-center gap-1 rounded-full bg-[color:var(--bg-subtle)] px-1.5 py-px text-[10px] font-medium tabular-nums text-[color:var(--text-muted)]"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden
                          className="size-3 fill-none stroke-current"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="8" y="8" width="12" height="12" rx="2.5" />
                          <path d="M16 4H6a2 2 0 0 0-2 2v10" />
                        </svg>
                        {fleetSize}
                        <span className="sr-only">
                          {' '}
                          listings by this publisher
                        </span>
                      </span>
                    )}
                  </span>
                )}
                {name}
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1.5">
              {downRecently && (
                <span
                  title="Answered no probes in the last 24 hours"
                  className="rounded-full border border-[color:var(--negative)]/35 bg-[color:var(--negative-dim)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--negative)]"
                >
                  Not answering
                </span>
              )}
              <EvidenceBadge verdict={verdict} />
            </span>
          </div>

          <p className="line-clamp-2 break-words text-xs leading-relaxed text-[color:var(--text-muted)] [overflow-wrap:anywhere]">
            {description}
          </p>

          {/*
            One line, not four values in a block.

            The footer carried publisher, attestations, availability and price
            on two rows. Scanning a grid, the publisher address was the one
            nobody read — it is an identifier, not a reason to choose, and the
            fleet chip above already says when a publisher holds many of these.
            Dropping it leaves the three that answer "is it up, has anyone else
            checked, what does it cost" on a single line.

            These labels are `sr-only`, which is `position: absolute`. With no
            positioned ancestor their containing block is the document, so a
            card in a horizontally scrolled strip placed them a thousand pixels
            past the viewport and stretched the page itself. The `relative` on
            the card root is what keeps them inside it.
          */}
          <dl className="mt-auto flex items-baseline justify-between gap-3 border-t border-[color:var(--border)] pt-2.5 text-[11px] text-[color:var(--text-faint)]">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <dt className="sr-only">Availability</dt>
              <dd className="tabular truncate">{availability}</dd>
              {attestations && (
                <>
                  <span aria-hidden>·</span>
                  <dt className="sr-only">Attestations</dt>
                  <dd className="tabular shrink-0">{attestations}</dd>
                </>
              )}
            </div>
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
              {quoted ? 'Hire agent' : 'Offer a budget'}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
