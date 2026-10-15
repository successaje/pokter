import Link from 'next/link';

import type { AssayDefinition } from '@/lib/assay/catalog';
import type { AssayRun } from '@/lib/assay/store';
import { cn } from '@/lib/ui/cn';
import { HealthFactorCheck } from './HealthFactorCheck';

function shown(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function CategoryCheck({ definition, run, agentKey }: { definition: AssayDefinition; run: AssayRun | null; agentKey?: string }) {
  if (definition.live) return <HealthFactorCheck run={run} />;
  const checked = run?.status === 'checked';
  const passedAll = checked && run.total > 0 && run.passed === run.total;
  /*
   * A paid check is graded from the artifacts funded jobs delivered, not
   * from a free call, and that is worth saying: it is what a buyer
   * actually receives, and every row names the job that paid for it, so
   * the claim can be checked against the chain rather than taken on
   * Pokter's word.
   */
  const paid = checked && run.via === 'paid-hire';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="t-label">{definition.label}</span>
        <Link href="/methodology#category-checks" className="text-[12px] text-ink-3 hover:text-ink">How it works</Link>
      </div>
      {!run ? (
        <p className="text-[13px] text-ink-3">Not checked yet. Eligible agents enter Pokter&rsquo;s rotating category-check schedule.</p>
      ) : run.status !== 'checked' ? (
        <p className="text-[13px] text-ink-3">
          Not checked: {run.detail ?? (run.status === 'paid-only' ? 'the agent requires payment before doing the work.' : 'the agent could not be asked.')}
          {run.status === 'paid-only' && ' Pokter checks these by hiring the published scenarios and grading what is delivered; this agent has not been checked that way yet.'}
        </p>
      ) : (
        <>
          <p className="flex items-start gap-2 text-[13.5px] text-ink-2">
            <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', passedAll ? 'bg-ok' : 'bg-bad')} aria-hidden />
            <span>
              Matched {run.passed} of {run.total} published scenarios.{' '}
              <span className="text-ink-3">
                {paid ? 'Graded from the work funded jobs delivered' : 'Asked directly, outside escrow'}, {new Date(run.ranAt).toUTCString().slice(5, 22)} UTC.
              </span>
            </span>
          </p>
          <div className="overflow-x-auto rounded-[12px] border border-rule">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead className="bg-sunken/60 text-[11.5px] uppercase tracking-wide text-ink-3">
                <tr><th className="px-4 py-2.5 font-medium">Scenario</th><th className="px-4 py-2.5 font-medium">Expected</th><th className="px-4 py-2.5 font-medium">Agent answered</th><th className="px-4 py-2.5 font-medium">Result</th>{paid && <th className="px-4 py-2.5 font-medium">Paid job</th>}</tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {run.results.map((result) => (
                  <tr key={result.scenario} className="align-top">
                    <td className="t-readout px-4 py-3">{result.scenario}</td>
                    <td className="max-w-52 break-words px-4 py-3">{shown(result.expected)}</td>
                    <td className="max-w-52 break-words px-4 py-3">{shown(result.observed)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-block rounded-[5px] px-1.5 py-px text-[11.5px] font-medium', result.pass ? 'bg-ok-wash text-ink' : 'bg-bad-wash text-ink')}>{result.pass ? 'Matched' : 'Did not match'}</span>
                      <p className="mt-1 max-w-sm text-[12px] leading-snug text-ink-3">{result.reason}</p>
                    </td>
                    {paid && (
                      <td className="whitespace-nowrap px-4 py-3">
                        {result.jobId ? (
                          agentKey ? (
                            <Link href={`/proof?agent=${encodeURIComponent(agentKey)}`} className="t-readout font-medium hover:underline">#{result.jobId}</Link>
                          ) : (
                            <span className="t-readout">#{result.jobId}</span>
                          )
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="rounded-[10px] border border-dashed border-rule-strong px-4 py-3 text-[12px] leading-relaxed text-ink-3">
        <p><strong className="font-medium text-ink-2">Source:</strong> {definition.provenance}</p>
        <p><strong className="font-medium text-ink-2">Does not prove:</strong> {definition.limitation}</p>
      </div>
    </div>
  );
}
