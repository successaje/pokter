import { StatusState } from '@/components/ui/States';
import Link from 'next/link';

import { cn } from '@/lib/ui/cn';
import { formatPercent, formatScore } from '@/lib/ui/format';
import { CATEGORIES, CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { leaderboardFor, superlativesFor } from '@/lib/leaderboard';
import { plural } from '@/lib/ui/plural';
import {
  DIMENSION_LABELS,
  DIMENSION_WEIGHTS,
  type Dimension,
} from '@/lib/score/types';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { RankingTable } from '@/components/leaderboard/RankingTable';
import { TierNote } from '@/components/proof/TierNote';

export const dynamic = 'force-dynamic';

const TABS: { id: Category | 'overall'; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  ...CATEGORIES.map(({ id, label }) => ({ id, label })),
];

function isTab(value: string): value is Category | 'overall' {
  return TABS.some((tab) => tab.id === value);
}

/**
 * One mark per award, so four cards in a row are told apart by shape rather
 * than by reading four near-identical headings.
 */
const AWARD_GLYPH: Record<string, string> = {
  reliability: '◎',
  evidence: '✦',
  record: '◷',
  responsive: '⚡',
};

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = String(params.category ?? 'overall');
  const active = isTab(raw) ? raw : 'overall';

  const entries = await leaderboardFor(active);
  const superlatives = superlativesFor(entries);

  /*
   * Derived once and rendered twice. The phone list and the desktop table are
   * different arrangements of the same row, so they can differ in shape but
   * never in what they claim about an agent.
   */
  const ranked = entries.map((entry, index) => {
    const meta =
      entry.category === 'unclassified'
        ? null
        : CATEGORY_BY_ID.get(entry.category);
    const uptime =
      entry.record.totalProbes === 0
        ? null
        : entry.record.totalAnswered / entry.record.totalProbes;

    return {
      key: `${entry.agent.chain_id}:${entry.agent.token_id}`,
      href: `/agents/${entry.agent.chain_id}/${entry.agent.token_id}`,
      rank: index + 1,
      name: entry.agent.name,
      // The category is only worth naming when the table is not already
      // filtered to one.
      categoryLabel: active === 'overall' && meta ? meta.label : null,
      score: formatScore(entry.score.overall),
      scoreValue: entry.score.overall,
      coverage: `${entry.score.measuredDimensions}/${entry.score.totalDimensions}`,
      verdict: entry.proof.verdict,
      uptime,
      uptimeLabel: uptime === null ? 'Uptime not measured' : `${formatPercent(uptime)} uptime`,
      probes: entry.record.totalProbes,
      probesLabel: plural(entry.record.totalProbes, 'probe'),
    };
  });

  return (
    <div className="flex flex-col gap-10 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Agent rankings
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Ordered by Pokter Score, which is built from reliability and evidence
          rather than returns — nobody publishes returns. Because one order
          cannot answer everyone&apos;s question, the awards below name the agent
          that leads on each specific metric.
        </p>
        {/*
          Said here as well as on the marketplace. A ranking is where the top
          tier is most conspicuously absent — the table is ordered by score and
          the strongest badge never appears — so this is where a reader is
          likeliest to read the gap as a defect rather than as the finding.
        */}
        <TierNote
          proven={entries.filter((e) => e.proof.verdict === 'proven').length}
          emerging={entries.filter((e) => e.proof.verdict === 'emerging').length}
          observed={entries.filter((e) => e.proof.verdict === 'observed').length}
        />
      </header>

      {/*
        The weights, on the page that applies them.
        
        They were only ever stated on the methodology page, so a ranking that
        argues it is not sponsored asked the reader to go elsewhere to check
        what it was actually built from. Read from DIMENSION_WEIGHTS rather
        than written out, so the sentence cannot drift from the formula the
        way a hand-typed list would.
      */}
      <div className="surface-card flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-medium">How this ranking works</span>
          <span className="tabular text-[11px] text-[color:var(--text-muted)]">
            {(Object.keys(DIMENSION_WEIGHTS) as Dimension[])
              .map((key) => `${DIMENSION_WEIGHTS[key]}% ${DIMENSION_LABELS[key].toLowerCase()}`)
              .join(' · ')}
          </span>
        </div>
        <Link
          href="/methodology"
          className="tap shrink-0 rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
        >
          Read methodology
        </Link>
      </div>

      <nav className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.id === 'overall' ? '/leaderboard' : `/leaderboard?category=${tab.id}`}
            className={cn(
              'tap shrink-0 rounded-[var(--radius)] border px-3 py-1.5 text-[13px] transition-colors',
              active === tab.id
                ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] text-[color:var(--text)]'
                : 'border-[color:var(--border)] text-[color:var(--text-muted)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/*
        §72. Best for — more useful than one generic order.

        These four answer the questions the overall ranking flattens: who
        answers most, who has been checked by the most independent parties, who
        has been watched longest, who replies fastest. They were four muted
        cards of 10px grey, quieter than the table beneath them, so the page's
        most specific answers were its least visible.

        One accent for all four rather than a colour each: the product reserves
        green, amber and red for what the evidence says, and spending them on
        decoration here would make a card look like a verdict. The glyph
        carries the difference instead.
      */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {superlatives.map((award) => (
          <div
            key={award.id}
            className="group relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-4 transition-[border-color,box-shadow] hover:border-[color:var(--brand)] hover:shadow-md"
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-0.5 bg-[color:var(--brand)]"
            />

            <div className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand-strong)]"
              >
                {AWARD_GLYPH[award.id] ?? '★'}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--brand-strong)]">
                  {award.label}
                </span>
                <span className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
                  {award.basis}
                </span>
              </span>
            </div>

            {award.winner ? (
              <>
                <div className="flex flex-col gap-0.5">
                  <span className="tabular text-2xl font-semibold leading-none tracking-tight">
                    {award.headline}
                  </span>
                  {award.qualifier && (
                    <span className="text-[11px] text-[color:var(--text-muted)]">
                      {award.qualifier}
                    </span>
                  )}
                </div>

                <Link
                  href={`/agents/${award.winner.agent.chain_id}/${award.winner.agent.token_id}`}
                  className="tap mt-auto border-t border-[color:var(--border)] pt-2.5 text-[13px] font-medium leading-snug hover:text-[color:var(--brand-strong)] hover:underline"
                >
                  {award.winner.agent.name}
                </Link>
              </>
            ) : (
              <span className="mt-auto text-[11px] leading-relaxed text-[color:var(--text-faint)]">
                {award.unavailable}
              </span>
            )}
          </div>
        ))}
      </section>

      {entries.length === 0 ? (
        <StatusState body="No agent in this category could be resolved right now." />
      ) : (
        <>
          {/*
            §6. A phone gets a ranked list, not a table.

            The seven columns are 720px wide inside a 350px viewport, so
            everything past the agent's name — score, evidence, uptime, probes —
            sat behind a sideways scroll that nothing announced. A ranking whose
            numbers are hidden is not a ranking.

            Both layouts read the same derived row, so they cannot disagree
            about a number; only the arrangement differs.
          */}
          <ol className="flex flex-col gap-2 md:hidden">
            {ranked.map((row) => (
              <li
                key={row.key}
                className={[
                  'rounded-[var(--radius-lg)] border bg-[color:var(--surface)]',
                  // The podium is visible on a phone too. It was the one place
                  // the ranking's own answer was rendered as grey body text.
                  row.rank === 1
                    ? 'border-[color:var(--brand)]/50 bg-[color:var(--bg-subtle)]'
                    : row.rank <= 3
                      ? 'border-[color:var(--border-strong)]'
                      : 'border-[color:var(--border)]',
                ].join(' ')}
              >
                <Link
                  href={row.href}
                  className="flex items-start gap-3 p-3"
                >
                  <span
                    className={[
                      'tabular mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold',
                      row.rank === 1
                        ? 'bg-[color:var(--brand)] text-[color:var(--brand-ink)]'
                        : row.rank === 2
                          ? 'bg-[color:var(--surface-raised)] text-[color:var(--text)] ring-1 ring-[color:var(--border-strong)]'
                          : row.rank === 3
                            ? 'bg-[color:var(--caution-dim)] text-[color:var(--caution)] ring-1 ring-[color:var(--caution)]/50'
                            : 'text-[color:var(--text-faint)]',
                    ].join(' ')}
                  >
                    {row.rank}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">
                          {row.name}
                        </span>
                        {row.categoryLabel && (
                          <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                            {row.categoryLabel}
                          </span>
                        )}
                      </span>
                      <EvidenceBadge verdict={row.verdict} />
                    </span>

                    {/*
                      The score leads because the page ranks on it, and the
                      coverage sits immediately beside it — a score drawn from
                      three of five dimensions is a different claim from one
                      drawn from five, and the table only said so in a column
                      nobody could see.
                    */}
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-[color:var(--text-muted)]">
                      <span className="tabular text-[15px] font-semibold text-[color:var(--text)]">
                        {row.score}
                      </span>
                      <span>on {row.coverage} dimensions</span>
                    </span>

                    <span className="tabular text-[11px] text-[color:var(--text-faint)]">
                      {row.uptimeLabel} · {row.probesLabel}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>

          <RankingTable rows={ranked} />

        </>
      )}

      <p className="max-w-3xl text-[11px] leading-relaxed text-[color:var(--text-faint)]">
        Ranking is not a recommendation. A high score means an agent has been
        checked and held up, not that it suits your capital, horizon or risk
        tolerance — that is what{' '}
        <Link href="/discover" className="underline underline-offset-2">
          Discover
        </Link>{' '}
        is for.
      </p>
    </div>
  );
}
