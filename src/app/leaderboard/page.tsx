import Link from 'next/link';

import { cn } from '@/lib/ui/cn';
import { formatPercent, formatScore } from '@/lib/ui/format';
import { CATEGORIES, CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { leaderboardFor, superlativesFor } from '@/lib/leaderboard';
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

      <nav className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.id === 'overall' ? '/leaderboard' : `/leaderboard?category=${tab.id}`}
            className={cn(
              'rounded-[var(--radius)] border px-3 py-1.5 text-[13px] transition-colors',
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
                  className="text-[13px] font-medium leading-snug hover:underline"
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
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--border)]">
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
              {entries.map((entry, index) => {
                const meta =
                  entry.category === 'unclassified'
                    ? null
                    : CATEGORY_BY_ID.get(entry.category);
                const uptime =
                  entry.record.totalProbes === 0
                    ? null
                    : entry.record.totalAnswered / entry.record.totalProbes;

                return (
                  <tr
                    key={`${entry.agent.chain_id}:${entry.agent.token_id}`}
                    className="border-b border-[color:var(--border)] last:border-b-0"
                  >
                    <td className="tabular p-4 text-[13px] text-[color:var(--text-faint)]">
                      {index + 1}
                    </td>
                    <td className="p-4">
                      <Link
                        href={`/agents/${entry.agent.chain_id}/${entry.agent.token_id}`}
                        className="text-[13px] font-medium hover:underline"
                      >
                        {entry.agent.name}
                      </Link>
                      {active === 'overall' && meta && (
                        <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                          {meta.label}
                        </span>
                      )}
                    </td>
                    <td className="tabular p-4 text-[13px]">
                      {formatScore(entry.score.overall)}
                    </td>
                    <td className="tabular p-4 text-[11px] text-[color:var(--text-muted)]">
                      {entry.score.measuredDimensions}/{entry.score.totalDimensions}
                    </td>
                    <td className="p-4">
                      <EvidenceBadge verdict={entry.proof.verdict} />
                    </td>
                    <td className="tabular p-4 text-[13px]">
                      {uptime === null ? (
                        <span className="text-[color:var(--text-faint)]">—</span>
                      ) : (
                        formatPercent(uptime)
                      )}
                    </td>
                    <td className="tabular p-4 text-[13px] text-[color:var(--text-muted)]">
                      {entry.record.totalProbes}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
