import type { Metadata } from 'next';
import Link from 'next/link';

import { ProofRunCheckPanel } from '@/features/proofrun/CheckPanel';
import { FIXTURE_SCENARIOS, OUTCOME_COPY, PROOFRUN_DOES_NOT_MEAN } from '@/features/proofrun/catalogue';
import { OutcomeGlyph } from '@/features/proofrun/Outcome';
import { scenarioSpec } from '@/features/proofrun/run';
import { TestAgentPanel } from '@/features/proofrun/TestAgentPanel';
import { shareMetadata } from '@/lib/og/share';
import type { AcceptanceSpec } from '@/lib/shared/contracts';
import { Icon } from '@/ui/icons';

export const metadata: Metadata = {
  title: 'ProofRun',
  description:
    'Don’t just ask what an agent can do. See where it fails. Named checks on a Venus health-factor report, stated before a job is funded and reported as passed, failed or not verified.',
  ...shareMetadata({
    title: 'ProofRun: see where an agent fails',
    description:
      'Named checks, stated before the money moves. Three outcomes per check, and no overall score.',
  }),
};

/*
 * No `revalidate` and no `force-dynamic`.
 *
 * Reading `searchParams` opts this page into rendering per request on its
 * own, so a revalidate window would describe a cache the page never uses —
 * the sort of comment that outlives the behaviour it was written for.
 * Nothing here reads a database or the network anyway: the criteria are
 * computed from code and a run happens only when somebody asks for one.
 */

/**
 * ProofRun's own page: what the checks are, what the three outcomes mean,
 * and a place to run one.
 *
 * The example panels near the bottom are the only thing here that could be
 * mistaken for evidence. Each carries its own caption rather than relying
 * on the paragraph above the pair, because a screenshot or a scroll
 * position that catches one panel alone must still say it is an example.
 * The signed one also carries no negotiation hash: a plausible-looking
 * hash is exactly the detail a careful reader trusts, because it looks
 * checkable.
 */
export default async function ProofRunPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const asked = typeof raw.scenario === 'string' ? raw.scenario : undefined;

  const spec = scenarioSpec();
  /*
   * The same criteria, shown under both bindings. `signed-terms` is built
   * here only to render the panel's own copy for it; there is no signature
   * behind it, which is why no hash and no time are attached.
   */
  const signedExample: AcceptanceSpec = { ...spec, binding: { kind: 'signed-terms' } };

  return (
    <div className="frame pb-24 pt-10 sm:pt-16">
      <header className="flex max-w-3xl flex-col gap-4 border-b border-rule pb-10">
        <span className="t-label flex items-center gap-2">
          <span className="tile" aria-hidden /> ProofRun
        </span>
        <h1 className="t-h1">Don’t just ask what an agent can do. See where it fails.</h1>
        <p className="t-lede">
          A ProofRun names what will be checked before a job is funded, then reports each check on its own: passed,
          failed, or not verified. There is no overall score, and a check that could not run is never counted as one
          that passed.
        </p>
      </header>

      {/* ---------- the three outcomes ---------- */}
      <section aria-labelledby="outcomes-h" className="scroll-mt-24 border-b border-rule py-10" id="outcomes">
        <h2 id="outcomes-h" className="t-h2 max-w-2xl">
          Three outcomes, and the third is the one that matters
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Most check surfaces have two states and quietly resolve everything else into the better one. The third state
          here is deliberate: unsupported, missing and unavailable all land in <strong className="font-semibold text-ink">not
          verified</strong>, and which of them it was travels with the check rather than being smoothed away.
        </p>
        <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-rule bg-rule sm:grid-cols-3">
          {(['passed', 'failed', 'not-verified'] as const).map((outcome) => (
            <div key={outcome} className="flex flex-col gap-2 bg-raised p-4 sm:p-5">
              <dt className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                <OutcomeGlyph outcome={outcome} size={11} />
                {OUTCOME_COPY[outcome].label}
              </dt>
              <dd className="text-[13px] leading-relaxed text-ink-2">{OUTCOME_COPY[outcome].meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------- what is checked ---------- */}
      <section aria-labelledby="criteria-h" className="scroll-mt-24 border-b border-rule py-10" id="criteria">
        <h2 id="criteria-h" className="t-h2 max-w-2xl">
          What this version checks
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          One vertical: a Venus Core Pool health-factor report on chain {spec.subject.chainId}. Only facts Venus itself
          can settle at a named block are here. Whether a position is wise, or whether to repay it, is deliberately
          absent — a check that cannot fail on evidence is not a check.
        </p>
        <ol className="mt-6 ruled overflow-hidden rounded-[14px] border border-rule">
          {spec.criteria.map((criterion, index) => (
            <li key={criterion.id} className="flex items-start gap-3 bg-raised px-4 py-3.5">
              <span className="t-readout w-6 shrink-0 pt-0.5 text-[12px] text-ink-3">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13.5px] leading-snug text-ink">{criterion.label}</span>
                <span className="t-readout text-[11px] text-ink-3">{criterion.id}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-ink-3">
          Two of these — that the report is about the right account, and that it names the chain it read — are settled
          structurally rather than scored: the checker produces a row for them only when a report gets them{' '}
          <em>wrong</em>, and refuses the whole comparison on the spot. So on a report that gets them right they come
          out as <strong className="font-medium text-ink">not verified</strong>, noting that nothing in the delivery or
          the chain reading settled them. That is the honest reading, and it is not a mark against the agent.
        </p>
        {/*
          Said out loud, because the page would otherwise imply a state the
          product cannot reach. `stateFromChecks` needs every criterion
          passed, and the two above are never settled positively, so no run
          against this criteria set reports "every check matched". A page
          that let a reader expect it would be describing a rule the code
          does not apply.
        */}
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-3">
          A consequence worth stating: because those two are never settled positively, no run against this criteria set
          reports <em>every</em> check matched. The best result available in this version is every compared check
          matching, with those two unsettled — so read the counts, not an overall verdict.
        </p>
      </section>

      {/* ---------- run one ---------- */}
      <section aria-labelledby="run-h" className="scroll-mt-24 border-b border-rule py-10" id="run">
        <h2 id="run-h" className="t-h2 max-w-2xl">
          Run one
        </h2>
        {/*
          No summary of the two kinds here. The runner below labels its own
          groups with the same words, and a card repeating them a few
          hundred pixels above read as two statements of one fact — and
          would be two places to keep in step.
        */}
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          {FIXTURE_SCENARIOS.length} synthetic fixtures and one historical replay, kept apart below because the
          difference is the whole meaning of a result. Both are free, read-only, and move no money.
        </p>
        <div className="mt-6 rounded-[14px] border border-rule bg-raised p-5 sm:p-6">
          <TestAgentPanel initialScenarioId={asked} heading="Run a check" />
        </div>
      </section>

      {/* ---------- the binding ---------- */}
      <section aria-labelledby="binding-h" className="scroll-mt-24 border-b border-rule py-10" id="binding">
        <h2 id="binding-h" className="t-h2 max-w-2xl">
          Did the agent agree to be checked on this?
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Criteria carry no weight on their own. What matters is whether the agent agreed to them, and there is exactly
          one thing that establishes it: its quote signature, from its registered wallet, over terms that carried the
          criteria hash. Anything short of that is Pokter writing something down, and the panel says so in those words.
        </p>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-3">
          Below are both, as the review step renders them.{' '}
          <strong className="font-medium text-ink">
            Examples only: there is no job, no quote and no agent behind either one.
          </strong>{' '}
          The signed example carries no negotiation hash, because there is no signature to point at.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="t-label flex items-center gap-1.5">
              <Icon.Lock size={12} /> Example · the agent signed
            </p>
            <ProofRunCheckPanel spec={signedExample} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="t-label flex items-center gap-1.5">
              <Icon.Alert size={12} /> Example · Pokter recorded only
            </p>
            <ProofRunCheckPanel spec={spec} />
          </div>
        </div>
      </section>

      {/* ---------- limits ---------- */}
      <section aria-labelledby="limits-h" className="scroll-mt-24 py-10" id="limits">
        <h2 id="limits-h" className="t-h2 max-w-2xl">
          What a ProofRun is not
        </h2>
        <ul className="mt-5 flex max-w-2xl flex-col gap-3">
          {PROOFRUN_DOES_NOT_MEAN.map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-[14px] leading-relaxed text-ink-2">
              <Icon.Dash size={14} className="mt-1 shrink-0 text-ink-3" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-ink-3">
          How Pokter measures agents more generally, and what it refuses to estimate, is on{' '}
          <Link href="/methodology" className="link text-ink">
            the methodology page
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
