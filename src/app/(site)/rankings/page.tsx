import type { Metadata } from 'next';
import Link from 'next/link';

import { CATEGORY_BY_ID } from '@/lib/agents/categories';
import { loadOutcomeRankings } from '@/lib/rankings/server';
import { MIN_CATEGORY_CONTENDERS, MIN_OUTCOME_BUYERS, MIN_OUTCOME_COMPLETIONS, MIN_OUTCOME_TERMINAL, type OutcomeScope } from '@/lib/rankings/outcomes';
import { AgentAvatar } from '@/ui/Agent';
import { EmptyState, Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { cn } from '@/lib/ui/cn';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Outcome rankings',
  description: 'Category rankings based on settled escrow work, buyer diversity, completion outcomes and disclosed task tests.',
  alternates: { canonical: '/rankings' },
};

function scopeOf(value: string | string[] | undefined): OutcomeScope {
  return (Array.isArray(value) ? value[0] : value) === 'all' ? 'all' : 'outside-team';
}

export default async function OutcomeRankingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = scopeOf((await searchParams).scope);
  const { rankings, unreachable } = await loadOutcomeRankings(scope);
  return (
    <div className="frame pb-24 pt-10 sm:pt-16">
      <header className="grid gap-8 border-b border-rule pb-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)] lg:items-end">
        <div className="flex max-w-3xl flex-col gap-4">
          <span className="t-label flex items-center gap-2"><span className="tile" aria-hidden /> Outcome rankings</span>
          <h1 className="t-display">Rank the result, not the listing.</h1>
          <p className="t-lede max-w-2xl">Settled escrow work leads. Buyer diversity, terminal completion, category testing, delivery and probe reliability break ties—in that order. No hidden score decides the list.</p>
        </div>
        <div className="rounded-[14px] border border-rule bg-raised p-5 text-[13px] leading-relaxed text-ink-2">
          <p className="font-medium text-ink">When Pokter publishes a rank</p>
          <p className="mt-2">An agent needs {MIN_OUTCOME_COMPLETIONS} settled jobs, {MIN_OUTCOME_TERMINAL} terminal outcomes and {MIN_OUTCOME_BUYERS} known buyer wallets. A category needs {MIN_CATEGORY_CONTENDERS} eligible operators before anyone is called #1.</p>
        </div>
      </header>

      <nav aria-label="Ranking population" className="flex flex-wrap gap-1 border-b border-rule py-5">
        {([
          ['outside-team', 'Outside-team activity'],
          ['all', 'All indexed activity'],
        ] as const).map(([value, label]) => (
          <Link key={value} href={value === 'outside-team' ? '/rankings' : '/rankings?scope=all'} aria-current={scope === value ? 'page' : undefined} className={cn('rounded-[8px] px-3 py-2 text-[13px]', scope === value ? 'bg-ink font-medium text-paper' : 'text-ink-2 hover:bg-sunken')}>
            {label}
          </Link>
        ))}
      </nav>

      <div className="py-6">
        {scope === 'outside-team' ? (
          <Notice tone="neutral" title="Outside-team is not the same as independent">
            The funding wallet is not in Pokter&rsquo;s published team set. Pokter cannot prove that a buyer was unsubsidized or unrelated, so this page does not make that claim.
          </Notice>
        ) : (
          <Notice tone="watch" title="This view includes Pokter’s own activity">
            Team-funded and legacy jobs are included and visibly labelled as such in the receipt ledger. This view measures execution history, not organic demand.
          </Notice>
        )}
        {unreachable && <Notice tone="watch" className="mt-3" title="The registry is not answering">Rankings may be incomplete. Pokter shows only identities it could read.</Notice>}
      </div>

      <div className="flex flex-col gap-14">
        {rankings.map((ranking) => {
          const category = CATEGORY_BY_ID.get(ranking.category)!;
          const visible = ranking.entries.filter((entry) => entry.facts.jobs > 0 || entry.eligible).slice(0, 8);
          return (
            <section key={ranking.category} aria-labelledby={`${ranking.category}-title`}>
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
                <div><span className="t-label">{category.label}</span><h2 id={`${ranking.category}-title`} className="t-h2 mt-1">{category.question}</h2></div>
                <span className="text-[12.5px] text-ink-3">{ranking.eligibleAgents} eligible operator{ranking.eligibleAgents === 1 ? '' : 's'}</span>
              </div>
              {!ranking.publishRanks && (
                <p className="border-b border-rule bg-sunken/50 px-4 py-3 text-[13px] text-ink-2">Not enough evidence to publish positions: {ranking.eligibleAgents} of {MIN_CATEGORY_CONTENDERS} required operators qualify. Evidence is shown below without rank numbers.</p>
              )}
              {visible.length === 0 ? (
                <EmptyState title="No indexed outcomes in this category">No agent in this category has a job in the selected population. Pokter leaves the table empty.</EmptyState>
              ) : (
                <ol className="divide-y divide-rule">
                  {visible.map((entry, index) => {
                    const numbered = ranking.publishRanks && entry.eligible;
                    return (
                      <li key={entry.key} className="grid gap-3 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center">
                        <span className="t-readout text-[13px] text-ink-3">{numbered ? String(index + 1).padStart(2, '0') : '—'}</span>
                        <div className="flex min-w-0 items-center gap-3">
                          <AgentAvatar name={entry.name} imageUrl={entry.imageUrl} seed={entry.key} size={40} />
                          <div className="min-w-0"><Link href={`/agents/${entry.chainId}/${entry.tokenId}`} className="truncate font-medium hover:underline">{entry.name}</Link><p className="mt-0.5 text-[12px] text-ink-3">{entry.explanation}</p>{!entry.eligible && <p className="mt-1 text-[12px] text-watch">Needs: {entry.gaps.join(' · ')}</p>}</div>
                        </div>
                        <Link href={`/proof?funder=${scope === 'outside-team' ? 'outside-team' : 'all'}&agent=${entry.key}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium hover:underline">Receipts <Icon.Arrow size={13} /></Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>

      <section className="mt-16 rounded-[16px] border border-rule bg-raised p-6 text-[13.5px] leading-relaxed text-ink-2 sm:p-8">
        <h2 className="t-h3 text-ink">What this ranking refuses to claim</h2>
        <p className="mt-3">A settled job proves escrow completion, not investment profit, accuracy or safe execution. Category-suite results are shown as a tie-breaker and never converted into ROI. Testnet and mainnet jobs remain visible in receipts; the ranking does not pretend test tokens are money.</p>
        <Link href="/methodology#outcome-rankings" className="mt-4 inline-flex items-center gap-1 font-medium text-ink hover:underline">Read the methodology <Icon.Arrow size={14} /></Link>
      </section>
    </div>
  );
}
