import { Suspense } from 'react';

import { recommend } from '@/lib/recommend/engine';
import type { Brief, RiskTolerance } from '@/lib/recommend/types';
import { OBJECTIVES } from '@/components/home/ObjectiveSelector';
import { BriefForm } from '@/components/discover/BriefForm';
import { MatchCard } from '@/components/discover/MatchCard';
import { WhyNot } from '@/components/discover/WhyNot';

/** The recommendation reads accumulated history, so it is never statically cached. */
export const dynamic = 'force-dynamic';

const RISKS: RiskTolerance[] = ['low', 'medium', 'high'];

function parseBrief(params: Record<string, string | string[] | undefined>): Brief {
  const objectiveId = String(params.objective ?? 'earn');
  const objective =
    OBJECTIVES.find((option) => option.id === objectiveId)?.category ?? 'yield';

  const riskParam = String(params.risk ?? 'medium') as RiskTolerance;

  return {
    objective,
    capital: Number(params.capital ?? 5000) || 5000,
    risk: RISKS.includes(riskParam) ? riskParam : 'medium',
    horizon: Number(params.horizon ?? 30) || 30,
  };
}

async function Results({ brief }: { brief: Brief }) {
  const result = await recommend(brief);
  const matchCount = result.matched;

  return (
    <div className="flex flex-col gap-8">
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
            We found {result.considered} agent(s) in this category, but none has
            enough verified evidence to recommend at {brief.risk} risk tolerance.
            Lowering the risk requirement widens the set — it does not create
            evidence that is missing.
          </p>
        </div>
      )}

      <WhyNot rejected={result.rejected} />

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

  return (
    <div className="flex flex-col gap-10 pt-6">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Find an agent
        </h1>
        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Tell Pokter what you are trying to do. We rank on verified evidence and
          measured reliability, and show you what we ruled out.
        </p>
      </header>

      <Suspense fallback={<div className="h-72" />}>
        <BriefForm />
      </Suspense>

      {shouldRun && <Results brief={brief} />}
    </div>
  );
}
