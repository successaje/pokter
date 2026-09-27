import { StatusState } from '@/components/ui/States';
import { plural } from '@/lib/ui/plural';
import { Suspense } from 'react';
import Link from 'next/link';

import { recommend } from '@/lib/recommend/engine';
import type { Brief, RiskTolerance } from '@/lib/recommend/types';
import { OBJECTIVES } from '@/components/home/ObjectiveSelector';
import { BriefForm } from '@/components/discover/BriefForm';
import { MatchCard } from '@/components/discover/MatchCard';
import { WhyNot } from '@/components/discover/WhyNot';
import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { listSearchable } from '@/lib/marketplace';
import { offersDirectHire, verdictFor } from '@/lib/search/match';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';

/** The recommendation reads accumulated history, so it is never statically cached. */
export const dynamic = 'force-dynamic';

const RISKS: RiskTolerance[] = ['low', 'medium', 'high'];

function boundedParam(
  raw: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function parseBrief(params: Record<string, string | string[] | undefined>): Brief {
  const requested = String(params.objective ?? 'earn')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const objectives = [
    ...new Set(
      requested
        .map((id) => OBJECTIVES.find((option) => option.id === id)?.category)
        .filter((value): value is Category => Boolean(value)),
    ),
  ];

  const riskParam = String(params.risk ?? 'medium') as RiskTolerance;

  return {
    objectives: objectives.length > 0 ? objectives : ['yield'],
    capital: boundedParam(params.capital, 5000, 1, 100_000_000),
    risk: RISKS.includes(riskParam) ? riskParam : 'medium',
    horizon: Math.round(boundedParam(params.horizon, 30, 1, 365)),
  };
}

async function Results({ brief }: { brief: Brief }) {
  const result = await recommend(brief);
  const matchCount = result.matched;
  const categories = brief.objectives
    .map((objective) => CATEGORY_BY_ID.get(objective)?.label ?? objective)
    .join(' + ');
  const objectiveQuery = brief.objectives
    .map(
      (category) =>
        OBJECTIVES.find((item) => item.category === category)?.id ?? category,
    )
    .join(',');

  return (
    <div id="matches" className="scroll-mt-24 flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-4 py-3 text-[11px] text-[color:var(--text-muted)]">
        <span className="font-medium text-[color:var(--text)]">
          {categories}
        </span>
        <span className="tabular">
          {brief.capital.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
          })}
        </span>
        <span className="capitalize">{brief.risk} risk tolerance</span>
        <span className="tabular">{brief.horizon}-day horizon</span>
        <Link
          href="/discover"
          className="ml-auto font-medium text-[color:var(--text-secondary)] underline decoration-[color:var(--border-strong)] underline-offset-4 hover:text-[color:var(--text)]"
        >
          Change brief
        </Link>
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-medium tracking-tight">
          We found {result.considered} relevant agent
          {result.considered === 1 ? '' : 's'}.
        </h2>
        <p className="text-sm text-[color:var(--text-secondary)]">
          {matchCount === 0
            ? 'None currently have enough evidence to recommend at this risk tolerance.'
            : `${matchCount} match your profile, ${result.rejected.length} ruled out.`}
        </p>
        {/*
          The surplus is stated rather than dropped. Only the leading few
          alternatives are rendered, and an agent that cleared every filter but
          fell outside that cut has not been ruled out — saying so is the
          difference between a shortlist and a silent truncation.
        */}
        {result.recommended && matchCount > result.alternatives.length + 1 && (
          <p className="text-[11px] text-[color:var(--text-faint)]">
            Showing the {result.alternatives.length + 1} strongest.{' '}
            {matchCount - result.alternatives.length - 1} more cleared every
            filter and are not listed here.
          </p>
        )}
      </div>

      {result.recommended ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
            Our recommendation
          </h3>
          <MatchCard match={result.recommended} primary />
        </div>
      ) : (
        /* §60. An honest empty state beats invented content. */
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] p-6">
          <p className="text-sm font-medium">No agent clears this bar yet.</p>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-[color:var(--text-muted)]">
            We found {plural(result.considered, 'agent')} in this category, but none has
            enough verified evidence to recommend at {brief.risk} risk tolerance.
            Increasing your risk tolerance may widen the set—it does not create
            evidence that is missing.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {brief.risk !== 'high' && (
              <Link
                href={`/discover?objective=${objectiveQuery}&capital=${brief.capital}&risk=high&horizon=${brief.horizon}&run=1#matches`}
                className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--surface-hover)]"
              >
                Try higher tolerance
              </Link>
            )}
            <Link
              href={
                brief.objectives.length === 1
                  ? `/categories/${brief.objectives[0]}`
                  : '/agents'
              }
              className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--surface-hover)]"
            >
              Browse every agent
            </Link>
          </div>
        </div>
      )}

      {result.alternatives.length > 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
            Alternatives
          </h3>
          <div className="grid gap-3 lg:grid-cols-3">
            {result.alternatives.map((match) => (
              <MatchCard key={match.listing.agent.token_id} match={match} />
            ))}
          </div>
        </div>
      )}

      <WhyNot rejected={result.rejected} />

      {/* §82 / §98. State the blind spots rather than implying there are none. */}
      <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
        <h3 className="text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          What this ranking could not consider
        </h3>
        <ul className="mt-3 flex flex-col gap-2">
          {result.limitations.map((limitation) => (
            <li
              key={limitation}
              className="text-[11px] leading-relaxed text-[color:var(--text-muted)]"
            >
              {limitation}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const brief = parseBrief(params);
  const shouldRun = params.run === '1';
  const explicitObjectives = typeof params.objective === 'string';
  const browseAgents = shouldRun ? [] : await listSearchable({ limit: 4 });
  const visibleAgents = browseAgents
    .filter(
      (entry) =>
        !explicitObjectives || brief.objectives.includes(entry.listing.category),
    )
    .slice(0, 8);
  const selectedObjective =
    typeof params.objective === 'string' && !params.objective.includes(',')
      ? params.objective
      : null;

  return (
    <div className="flex flex-col gap-10 pt-6">
      <header className="flex max-w-3xl flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand)]">
          Evidence-ranked discovery
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Find an agent
        </h1>
        {/*
          Desktop only. On a phone this paragraph and the strip below it put
          four lines of positioning between the title and the goal chips, which
          are the actual control for this page.
        */}
        <p className="hidden text-sm leading-relaxed text-[color:var(--text-secondary)] md:block">
          Start with the outcome you want. Pokter compares onchain identity,
          measured reliability and evidence quality—and shows why each agent did
          or did not qualify.
        </p>
        <div className="hidden flex-wrap gap-x-5 gap-y-1 text-[11px] text-[color:var(--text-muted)] md:flex">
          <span>4 financial strategies</span>
          <span>ERC-8004 identities</span>
          <span>Live endpoint evidence</span>
        </div>
      </header>

      <div className="md:hidden">
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href="/discover"
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 py-2 text-xs font-medium md:min-h-0 ${!selectedObjective ? 'border-[color:var(--brand)] bg-[color:var(--brand)] text-[color:var(--brand-ink)]' : 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)]'}`}
          >
            All agents
          </Link>
          {OBJECTIVES.map((objective) => (
            <Link
              key={objective.id}
              href={`/discover?objective=${objective.id}`}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 py-2 text-xs font-medium md:min-h-0 ${selectedObjective === objective.id ? 'border-[color:var(--brand)] bg-[color:var(--brand)] text-[color:var(--brand-ink)]' : 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)]'}`}
            >
              {objective.label}
            </Link>
          ))}
        </div>

        <details className="mt-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
            <span className="flex size-9 items-center justify-center rounded-[var(--radius)] bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand)]" aria-hidden>
              <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="1.8"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" /></svg>
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-medium">Tune recommendations</span>
              <span className="text-[10px] text-[color:var(--text-faint)]">Goals, capital, risk and time horizon</span>
            </span>
            <span aria-hidden className="text-[color:var(--text-faint)]">⌄</span>
          </summary>
          <div className="border-t border-[color:var(--border)] p-2">
            <Suspense fallback={<div className="h-72" />}>
              <BriefForm />
            </Suspense>
          </div>
        </details>
      </div>

      <div className="hidden md:block">
        <Suspense fallback={<div className="h-72" />}>
          <BriefForm />
        </Suspense>
      </div>

      {!shouldRun && (
        <section className="flex flex-col gap-3 md:hidden">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Explore agents</h2>
              <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">Open any profile to review its evidence before hiring.</p>
            </div>
            <Link href="/agents" className="inline-flex min-h-11 shrink-0 items-center text-[11px] text-[color:var(--info)] md:inline md:min-h-0">View all</Link>
          </div>
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
            {visibleAgents.map((entry, index) => {
              const { agent } = entry.listing;
              const category = CATEGORY_BY_ID.get(entry.listing.category);
              return (
                <div
                  key={`${agent.chain_id}:${agent.token_id}`}
                  className={`flex min-h-[4.75rem] items-center gap-3 pr-3 transition-colors hover:bg-[color:var(--surface-hover)] ${index > 0 ? 'border-t border-[color:var(--border)]' : ''}`}
                >
                  <Link
                    href={`/agents/${agent.chain_id}/${agent.token_id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4"
                  >
                    <AgentAvatar name={agent.name} src={agent.image_url} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-sm font-medium">{agent.name}</span>
                      <span className="truncate text-[10px] text-[color:var(--text-muted)]">{category?.label ?? 'Agent'} · {agent.supported_protocols?.slice(0, 2).join(' · ') || 'No endpoint declared'}</span>
                    </span>
                    <EvidenceBadge verdict={verdictFor(entry)} />
                  </Link>
                  {/*
                    Hire on the row itself. Reaching it used to take row →
                    detail → hire, which is three screens on a phone to do the
                    one thing the quest actually measures.

                    Offered only where the accumulated evidence supports it. A
                    button that leads straight to a blocked page is worse than
                    no button, so unproven and failing agents keep the chevron
                    and nothing else.
                  */}
                  {offersDirectHire(entry) ? (
                    <Link
                      href={`/hire/${agent.chain_id}/${agent.token_id}`}
                      className="action-primary shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-medium"
                    >
                      Hire
                    </Link>
                  ) : (
                    <span aria-hidden className="shrink-0 text-[color:var(--text-faint)]">›</span>
                  )}
                </div>
              );
            })}
          </div>
          {visibleAgents.length === 0 && (
            <StatusState body="No indexed agents currently match this category." />
          )}
        </section>
      )}

      {shouldRun && <Results brief={brief} />}
    </div>
  );
}
