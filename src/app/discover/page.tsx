import { plural } from '@/lib/ui/plural';
import { Suspense } from 'react';
import Link from 'next/link';

import { recommend } from '@/lib/recommend/engine';
import type { Brief, RiskTolerance } from '@/lib/recommend/types';
import { OBJECTIVES } from '@/lib/agents/objectives';
import { BriefForm } from '@/components/discover/BriefForm';
import { MatchCard } from '@/components/discover/MatchCard';
import { WhyNot } from '@/components/discover/WhyNot';
import { CATEGORY_BY_ID, type Category } from '@/lib/agents/categories';
import { getEcosystemStats, listSearchable } from '@/lib/marketplace';
import { MarketplacePulse } from '@/components/discover/MarketplacePulse';
import { ExploreMarketplace } from '@/components/discover/ExploreMarketplace';
import { AskLauncher } from '@/components/discover/AskLauncher';
import { getMarketplaceActivity } from '@/lib/discover/pulse';

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
  const selectedCategory =
    typeof params.category === 'string' && CATEGORY_BY_ID.has(params.category as Category)
      ? params.category
      : null;
  const [browseAgents, stats] = shouldRun
    ? [[], null]
    : /*
       * Same depth as the marketplace page. At 8 per category this counted 32
       * "curated listings" while /agents reported 81 indexed — the same set,
       * described two ways, on two pages a visitor moves between.
       */
      await Promise.all([listSearchable({ limit: 30 }), getEcosystemStats()]);
  const activity = shouldRun ? null : getMarketplaceActivity();
  const answering = browseAgents.filter(
    (entry) => entry.record.totalAnswered > 0,
  ).length;
  const attestations = browseAgents.reduce(
    (sum, entry) => sum + entry.listing.attestationCount,
    0,
  );

  return (
    <div className="flex flex-col gap-12 pt-6">
      <AskLauncher />
      <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        {/*
          A title, and nothing standing in front of it.

          This was an eyebrow, a title and a paragraph — the eyebrow naming the
          site on the site, and the paragraph describing two ways in that are
          both visible controls a few hundred pixels below. Three pieces of
          furniture before the first agent, none of them the agent.
        */}
        <div className="flex max-w-3xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Explore agents. Inspect the evidence.
        </h1>
        </div>
        {/*
          The header used to carry a button jumping to a collapsed panel at
          the foot of the page. The panel now sits immediately below this, so
          a link to it would be pointing at something already in view.
        */}
      </header>

      {!shouldRun && stats && activity && (
        <>
          {/*
            Coverage first. It is three numbers on one line and it frames
            everything under it — how much of the registry this page is
            actually drawing from — so it costs a row and earns it.
          */}
          <MarketplacePulse
            stats={stats}
            listed={browseAgents.length}
            answering={answering}
            attestations={attestations}
            activity={activity}
          />

          {/*
            The guided path, as a bar rather than a billboard.

            It began as a collapsed strip at the foot of the page, below the
            market it exists to narrow. Moving it up was right; giving it a
            hero card was not — it pushed the market itself below the fold to
            advertise a form. One line states the offer, and the form is a
            click away for anyone who wants it.
          */}
          {/*
            The structured form, closed.
            
            The conversational route now lives in a launcher in the corner
            rather than as a band across the top of this page: it was costing
            the page a card of prose before a visitor had asked for anything,
            on a page whose job is to show agents.
          */}
          <details className="group">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[color:var(--text-faint)]">
              <span>Prefer to set capital and risk yourself?</span>
              <span className="ml-auto underline decoration-dotted underline-offset-2 hover:text-[color:var(--text)]">
                <span className="group-open:hidden">Open the shortlist builder</span>
                <span className="hidden group-open:inline">Hide</span>
              </span>
            </summary>

            <div className="mt-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-2 sm:p-3">
              <Suspense fallback={<div className="h-72" />}>
                <BriefForm />
              </Suspense>
            </div>
          </details>



          <ExploreMarketplace agents={browseAgents} selectedCategory={selectedCategory} />

        </>
      )}

      {shouldRun && <Results brief={brief} />}
    </div>
  );
}
