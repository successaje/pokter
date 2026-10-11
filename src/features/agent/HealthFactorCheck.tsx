import Link from 'next/link';

import type { AssayRun } from '@/lib/assay/store';
import { explorerBaseFor } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';

const OUTCOME: Record<string, { label: string; tone: string }> = {
  correct: { label: 'Matches Venus', tone: 'bg-ok-wash text-ink' },
  'borrow-limit': { label: 'Borrowing-limit ratio', tone: 'bg-watch-wash text-ink' },
  wrong: { label: 'Does not match', tone: 'bg-bad-wash text-ink' },
  unreadable: { label: 'No readable answer', tone: 'bg-sunken text-ink-2' },
};

function readingOf(expected: unknown): number | null {
  const before = (expected as { before?: { healthFactor?: number | null } })?.before;
  return typeof before?.healthFactor === 'number' ? before.healthFactor : null;
}

function answerOf(observed: unknown): string {
  const o = observed as { healthFactor?: number | null; unbounded?: boolean } | null;
  if (!o) return '—';
  if (o.unbounded) return 'No debt';
  return typeof o.healthFactor === 'number' ? o.healthFactor.toFixed(3) : '—';
}

function summary(run: AssayRun): { text: string; tone: 'ok' | 'watch' | 'bad' | 'none' } {
  if (run.status === 'not-askable') return { text: `Could not be checked. ${run.detail ?? ''}`.trim(), tone: 'none' };
  if (run.status === 'paid-only') return { text: 'Not checked: this agent answers only with a price and does the work once paid. Pokter does not pay for checks.', tone: 'none' };
  const borrowLimit = run.results.filter((r) => r.outcome === 'borrow-limit').length;
  const text = `Matched Venus on ${run.passed} of ${run.total} live position${run.total === 1 ? '' : 's'}${borrowLimit ? `; ${borrowLimit} answered with the borrowing-limit ratio instead` : ''}.`;
  return { text, tone: run.passed === run.total ? 'ok' : run.results.some((r) => r.outcome === 'wrong') ? 'bad' : 'watch' };
}

const DOT = { ok: 'bg-ok', watch: 'bg-watch', bad: 'bg-bad', none: 'bg-rule-strong' } as const;

/**
 * The health factor check on an agent profile: real Venus positions, what
 * Pokter read from the chain, what the agent answered, and why each one
 * matched or did not.
 */
export function HealthFactorCheck({ run }: { run: AssayRun | null }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="t-label">Health factor check</span>
        <Link href="/methodology#health-factor-check" className="text-[12px] text-ink-3 hover:text-ink">
          How it works
        </Link>
      </div>
      {!run ? (
        <p className="text-[13px] text-ink-3">Not checked yet. Health factor agents are asked about live Venus positions every few days.</p>
      ) : (
        <>
          <p className="flex items-start gap-2 text-[13.5px] text-ink-2">
            <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', DOT[summary(run).tone])} aria-hidden />
            <span>
              {summary(run).text}{' '}
              <span className="text-ink-3">
                {run.status === 'checked' ? 'Checked' : 'Last tried'} {new Date(run.ranAt).toUTCString().slice(5, 22)} UTC.
              </span>
            </span>
          </p>
          {run.results.length > 0 && (
            <div className="overflow-x-auto rounded-[12px] border border-rule">
              <table className="w-full min-w-[520px] text-left text-[13px]">
                <thead className="bg-sunken/60 text-[11.5px] uppercase tracking-wide text-ink-3">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Venus position</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Pokter read</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Agent answered</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {run.results.map((r) => {
                    const outcome = OUTCOME[r.outcome] ?? OUTCOME.unreadable;
                    return (
                      <tr key={r.scenario} className="align-top">
                        <td className="px-4 py-3">
                          <a href={`${explorerBaseFor(56)}/address/${r.scenario}`} target="_blank" rel="noreferrer noopener" className="t-readout link">
                            {shortAddress(r.scenario)}
                          </a>
                        </td>
                        <td className="t-readout px-4 py-3">{readingOf(r.expected)?.toFixed(3) ?? 'No debt'}</td>
                        <td className="t-readout px-4 py-3">{answerOf(r.observed)}</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-block rounded-[5px] px-1.5 py-px text-[11.5px] font-medium', outcome.tone)}>{outcome.label}</span>
                          <p className="mt-1 max-w-sm text-[12px] leading-snug text-ink-3">{r.reason}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {run.results.length > 0 && <p className="text-[12px] leading-relaxed text-ink-3">
            Pokter reads each position from Venus on BNB Smart Chain just before and just after asking the agent; an answer within 2% of either reading matches. This checks the reported figure, not advice or any action the agent might take.
          </p>}
        </>
      )}
    </div>
  );
}
