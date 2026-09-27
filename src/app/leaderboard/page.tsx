import Link from 'next/link';

import { cn } from '@/lib/ui/cn';
import { formatPercent, formatScore } from '@/lib/ui/format';
import { CATEGORIES, CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { leaderboardFor, superlativesFor } from '@/lib/leaderboard';
import { plural } from '@/lib/ui/plural';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';

export const dynamic = 'force-dynamic';

const TABS: { id: Category | 'overall'; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  ...CATEGORIES.map(({ id, label }) => ({ id, label })),
];

function isTab(value: string): value is Category | 'overall' {
  return TABS.some((tab) => tab.id === value);
}

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
      </header>

      <nav className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.id === 'overall' ? '/leaderboard' : `/leaderboard?category=${tab.id}`}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius)] border px-3 py-1.5 text-[13px] transition-colors md:min-h-0',
              active === tab.id
                ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] text-[color:var(--text)]'
                : 'border-[color:var(--border)] text-[color:var(--text-muted)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text)]',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* §72. Best for — more useful than one generic order. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {superlatives.map((award) => (
          <div
            key={award.id}
            className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                {award.label}
              </span>
              <span className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
                {award.basis}
              </span>
            </div>

            {award.winner ? (
              <>
                <Link
                  href={`/agents/${award.winner.agent.chain_id}/${award.winner.agent.token_id}`}
                  className="inline-flex min-h-11 items-center text-[13px] font-medium leading-snug hover:underline md:inline md:min-h-0"
                >
                  {award.winner.agent.name}
                </Link>
                <span className="tabular mt-auto text-[11px] text-[color:var(--positive)]">
                  {award.value}
                </span>
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
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] p-8 text-center text-xs text-[color:var(--text-faint)]">
          No agent in this category could be resolved right now.
        </p>
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
                className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]"
              >
                <Link
                  href={row.href}
                  className="flex items-start gap-3 p-3"
                >
                  <span className="tabular mt-0.5 w-5 shrink-0 text-[13px] font-medium text-[color:var(--text-faint)]">
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

          <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--border)] md:block">
            <table className="w-full min-w-[720px] border-collapse bg-[color:var(--surface)]">
              <thead>
                <tr className="border-b border-[color:var(--border)] text-left">
                  {['#', 'Agent', 'Score', 'Measured on', 'Evidence', 'Uptime', 'Probes'].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="p-4 text-[10px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>

              <tbody>
                {ranked.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-[color:var(--border)] last:border-b-0"
                  >
                    <td className="tabular p-4 text-[13px] text-[color:var(--text-faint)]">
                      {row.rank}
                    </td>
                    <td className="p-4">
                      <Link
                        href={row.href}
                        className="text-[13px] font-medium hover:underline"
                      >
                        {row.name}
                      </Link>
                      {row.categoryLabel && (
                        <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                          {row.categoryLabel}
                        </span>
                      )}
                    </td>
                    <td className="tabular p-4 text-[13px]">{row.score}</td>
                    <td className="tabular p-4 text-[11px] text-[color:var(--text-muted)]">
                      {row.coverage}
                    </td>
                    <td className="p-4">
                      <EvidenceBadge verdict={row.verdict} />
                    </td>
                    <td className="tabular p-4 text-[13px]">
                      {row.uptime === null ? (
                        <span className="text-[color:var(--text-faint)]">—</span>
                      ) : (
                        formatPercent(row.uptime)
                      )}
                    </td>
                    <td className="tabular p-4 text-[13px] text-[color:var(--text-muted)]">
                      {row.probes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
