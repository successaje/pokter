import Link from 'next/link';

import type { AssayDefinition } from '@/lib/assay/catalog';
import { answerComparison } from '@/lib/assay/comparison';
import type { AssayRun } from '@/lib/assay/store';
import { AnswerComparison, utc } from './AnswerComparison';
import { HealthFactorCheck } from './HealthFactorCheck';

export function CategoryCheck({ definition, run, agentKey }: { definition: AssayDefinition; run: AssayRun | null; agentKey?: string }) {
  /*
   * A graded run shows the full comparison, whichever kind of check it is:
   * reference, answer, difference and result, with the network, reference
   * block, tolerance and time. A paid run names the job that paid for each
   * answer, so the claim can be checked against the chain rather than taken
   * on Pokter's word.
   */
  const comparison = answerComparison(run);
  if (!comparison && definition.live) return <HealthFactorCheck run={run} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="t-label">{definition.label}</span>
        <Link href={definition.live ? '/methodology#health-factor-check' : '/methodology#category-checks'} className="text-[12px] text-ink-3 hover:text-ink">How it works</Link>
      </div>
      {comparison ? (
        <AnswerComparison comparison={comparison} agentKey={agentKey} />
      ) : !run ? (
        <p className="text-[13px] text-ink-3">Not checked yet. Eligible agents enter Pokter&rsquo;s rotating category-check schedule.</p>
      ) : run.status !== 'checked' ? (
        <p className="text-[13px] text-ink-3">
          Not checked: {run.detail ?? (run.status === 'paid-only' ? 'the agent requires payment before doing the work.' : 'the agent could not be asked.')}
          {run.status === 'paid-only' && ' Pokter checks these by hiring the published scenarios and grading what is delivered; this agent has not been checked that way yet.'}
        </p>
      ) : (
        <p className="text-[13px] text-ink-3">{run.detail ?? 'Delivered, but none of it could be scored.'} {run.via === 'paid-hire' ? 'Graded from the work funded jobs delivered' : 'Asked directly, outside escrow'}, {utc(run.ranAt)}.</p>
      )}
      <div className="rounded-[10px] border border-dashed border-rule-strong px-4 py-3 text-[12px] leading-relaxed text-ink-3">
        <p><strong className="font-medium text-ink-2">Source:</strong> {definition.provenance}</p>
        <p><strong className="font-medium text-ink-2">Does not prove:</strong> {definition.limitation}</p>
      </div>
    </div>
  );
}
