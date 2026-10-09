'use client';

import Link from 'next/link';

import type { FindRow } from '@/lib/find/rows';
import { VERDICT_LABEL } from '@/lib/proof/engine';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { suggestionLabel, suggestionNote } from '@/lib/find/suggested';
import { Button } from '@/components/ui/Button';
import { Status } from '@/components/ui/Status';
import { plural } from '@/lib/ui/plural';
import { formatMs } from '@/lib/ui/format';
import { Strip } from './Strip';

const VERDICT_TONE = {
  proven: 'positive',
  reliable: 'positive',
  emerging: 'caution',
  observed: 'info',
  failing: 'negative',
  unproven: 'neutral',
} as const;

const percent = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)}%`);

/** A rail only earns its place if it has something to put in it. */
interface Rail {
  title: string;
  note: string;
  rows: FindRow[];
}

function buildRails(rows: FindRow[], featured: FindRow | null): Rail[] {
  const without = (list: FindRow[]) => list.filter((row) => row.key !== featured?.key);
  /*
   * More rails are defined than are drawn, and the first three that fill
   * up are the ones shown. On a quiet day nothing is answering and almost
   * nothing has been paid for, so a fixed set would leave the page with
   * one rail and two apologies; on a busy one the strongest two are the
   * ones worth the space. Two agents is enough to be a row — below that it
   * reads as a mistake.
   */
  const candidates: Rail[] = [
    {
      title: 'Answering now',
      note: 'Answered Pokter’s check today.',
      rows: without(rows.filter((row) => row.answeringToday)),
    },
    {
      title: 'Has been paid for work',
      note: 'Completed at least one escrowed job through Pokter.',
      rows: without(rows.filter((row) => row.paid.completed > 0)).sort(
        (a, b) => b.paid.completed - a.paid.completed,
      ),
    },
    {
      title: 'Names its own price',
      note: 'Returned a price signed by the agent’s own wallet.',
      /*
       * Signed at all, not signed recently. The table below shows a price
       * whenever the agent has ever returned one and re-quotes at hire, so
       * demanding an unexpired signature here would hide agents the next
       * section lists with a price beside them — the two halves of one
       * page disagreeing about who charges what.
       */
      rows: without(rows.filter((row) => row.priceU !== null)).sort(
        (a, b) => (a.priceU ?? 0) - (b.priceU ?? 0),
      ),
    },
    {
      title: 'Longest record',
      note: 'Most checks answered, over the most checks taken.',
      rows: without(rows.filter((row) => row.probes > 0)).sort(
        (a, b) => (b.rate ?? 0) - (a.rate ?? 0) || b.probes - a.probes,
      ),
    },
  ];
  return candidates
    .filter((rail) => rail.rows.length >= 2)
    .slice(0, 3)
    .map((rail) => ({ ...rail, rows: rail.rows.slice(0, 12) }));
}

/**
 * Which agent leads, and the reason it does.
 *
 * Taking the first hirable row put an agent the table underneath calls
 * "quiet for 30 days, 0 of 4 delivered" under the words "Top pick today".
 * On a marketplace whose whole claim is that it reports what it measured,
 * a headline the next paragraph contradicts is the worst thing on the
 * page.
 *
 * So the order is explicit — answering beats delivered, delivered beats a
 * good ratio, and a good ratio beats a long one — and the label is read
 * back off whichever of those actually applied. When nothing has answered
 * and nothing has been paid for, it says so instead of inventing a
 * superlative.
 */
function pickFeatured(rows: FindRow[]): FindRow | null {
  const hirable = rows.filter((row) => row.hirable);
  const pool = hirable.length > 0 ? hirable : rows;
  return (
    [...pool].sort(
      (a, b) =>
        Number(b.answeringToday) - Number(a.answeringToday) ||
        b.paid.completed - a.paid.completed ||
        (b.rate ?? 0) - (a.rate ?? 0) ||
        b.probes - a.probes,
    )[0] ?? null
  );
}

/** Enough checks that a ratio means anything. Below this it is a coin toss. */
const RATIO_IS_MEANINGFUL = 20;

function featureReason(row: FindRow): string {
  if (row.answeringToday) return 'Answering right now';
  if (row.paid.completed > 0) return `${plural(row.paid.completed, 'job')} delivered`;
  if (row.probes >= RATIO_IS_MEANINGFUL && (row.rate ?? 0) >= 0.9) return 'Strongest record';
  if (row.probes > 0) return 'Most checked so far';
  return 'Newly listed';
}

/**
 * The agents themselves, before the list of all of them.
 *
 * Discover opened straight onto a table, which is the right tool once you
 * know what you are after and a cold start for everybody else. What stood
 * here before was a carousel that advanced on a timer — a banner that
 * moves while you are reading it — and before that a brief, three
 * questions deep, that no agent appeared behind until you answered.
 *
 * So it shows agents. One pick, then rails you can push through sideways,
 * each named for the evidence that put an agent in it rather than for a
 * mood: answering now, has been paid, longest record. Nothing advances by
 * itself — the reader moves it — and a rail with fewer than three agents
 * is not drawn at all rather than padded out.
 *
 * Every figure here comes from the rows the list below is built from, so
 * this costs no request and cannot disagree with the table underneath it.
 */
export function AgentSpotlight({ rows, onBrowse }: { rows: FindRow[]; onBrowse: () => void }) {
  const featured = pickFeatured(rows);
  const rails = buildRails(rows, featured);
  if (!featured) return null;

  return (
    <section aria-label="Agents worth a look" className="flex flex-col gap-6">
      <article className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 sm:flex-row sm:items-start sm:gap-5">
        <AgentAvatar name={featured.name} src={featured.imageUrl} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="mono text-caption uppercase tracking-wide text-ink-faint">
              {featureReason(featured)}
            </span>
            <Status tone={VERDICT_TONE[featured.verdict]}>{VERDICT_LABEL[featured.verdict]}</Status>
          </div>
          <h2 className="truncate text-title" title={featured.name}>
            {featured.name}
          </h2>
          <p className="text-body-s text-ink-muted">
            {featured.categoryLabel}
            {featured.medianMs !== null && ` · answers in ${formatMs(featured.medianMs)}`}
            {featured.paid.completed > 0 && ` · ${plural(featured.paid.completed, 'job')} delivered`}
          </p>
          <div className="flex items-center gap-3">
            <Strip cells={featured.cells} />
            <span className="tabular text-small text-ink-muted">
              {featured.probes ? `${percent(featured.rate)} of ${plural(featured.probes, 'check')}` : 'Not called yet'}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:w-44">
          <p className="text-small text-ink-muted">
            {featured.priceU !== null ? 'Its signed price' : 'Suggested to start'}
          </p>
          {/*
            This printed "You set the budget" as both the label and the
            figure, so the panel said the same sentence twice and named no
            number at all. The suggestion is the number; the label says who
            stands behind it, and nobody does.
          */}
          <p
            className="tabular -mt-1 text-xl font-semibold"
            title={featured.priceU === null && featured.suggested ? suggestionNote(featured.suggested, featured.categoryLabel) : undefined}
          >
            {featured.priceU !== null
              ? featured.priceLabel
              : featured.suggested
                ? suggestionLabel(featured.suggested)
                : featured.priceLabel}
          </p>
          <Button href={`/agents/${featured.chainId}/${featured.tokenId}?hire=1`} variant="primary" size="sm" block>
            Hire
          </Button>
          <Button href={`/agents/${featured.chainId}/${featured.tokenId}`} size="sm" block>
            Open the record
          </Button>
        </div>
      </article>

      {rails.map((rail) => (
        <div key={rail.title} className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-body-s font-medium">{rail.title}</h2>
            <p className="hidden text-small text-ink-muted sm:block">{rail.note}</p>
          </div>
          {/*
            A scroll container, not a slideshow. Snap points so a push
            settles on a card, the bleed and padding so the row runs to the
            edge of a phone without its first card touching it, and the
            scrollbar hidden because the cards are their own affordance.
          */}
          <ul
            className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
            aria-label={rail.title}
          >
            {rail.rows.map((row) => (
              <li key={row.key} className="w-56 shrink-0 snap-start">
                <Link
                  href={`/agents/${row.chainId}/${row.tokenId}`}
                  className="flex h-full flex-col gap-2 rounded-lg border border-line bg-surface p-3.5 transition-colors hover:border-line-strong hover:bg-surface-hover"
                >
                  <span className="flex items-center gap-2.5">
                    <AgentAvatar name={row.name} src={row.imageUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-s font-medium" title={row.name}>
                        {row.name}
                      </span>
                      <span className="block truncate text-small text-ink-muted">{row.categoryLabel}</span>
                    </span>
                  </span>
                  <Strip cells={row.cells} />
                  <span className="mt-auto flex items-baseline justify-between gap-2 pt-0.5">
                    <span className="tabular text-small text-ink-muted">
                      {row.probes ? `${percent(row.rate)} of ${row.probes}` : 'Not called'}
                    </span>
                    <span
                      className={
                        row.priceU !== null ? 'tabular text-small font-medium text-ink' : 'tabular text-small text-ink-muted'
                      }
                    >
                      {row.priceU !== null ? row.priceLabel : row.suggested ? suggestionLabel(row.suggested) : 'Set budget'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-line" />
        <button
          type="button"
          onClick={onBrowse}
          className="tap-safe rounded-md border border-line px-3 py-1.5 text-small font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink"
        >
          Or search all {rows.length} agents ↓
        </button>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>
    </section>
  );
}
