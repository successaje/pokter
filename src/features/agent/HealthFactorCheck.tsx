import Link from 'next/link';

import type { AssayRun } from '@/lib/assay/store';
import { cn } from '@/lib/ui/cn';

function summary(run: AssayRun): { text: string; tone: 'ok' | 'watch' | 'bad' | 'none' } {
  if (run.status === 'not-askable') return { text: `Could not be checked. ${run.detail ?? ''}`.trim(), tone: 'none' };
  if (run.status === 'paid-only') return { text: 'Not checked by a direct call: this agent answers one with a price and does the work once paid. Pokter checks these by hiring the published positions and grading what is delivered; that has not been done for this agent yet.', tone: 'none' };
  // Every position delivered against had moved too far to compare: a result, but not a score either way.
  return { text: `${run.detail ?? 'Delivered, but none of it could be scored.'}`, tone: 'none' };
}

const DOT = { ok: 'bg-ok', watch: 'bg-watch', bad: 'bg-bad', none: 'bg-rule-strong' } as const;

/**
 * The health factor check on an agent profile before it has anything to
 * compare: not checked yet, or a run that scored nothing. A graded run is
 * shown as the full comparison (`AnswerComparison`).
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
        <p className="flex items-start gap-2 text-[13.5px] text-ink-2">
          <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', DOT[summary(run).tone])} aria-hidden />
          <span>
            {summary(run).text}{' '}
            <span className="text-ink-3">
              {run.status === 'checked' ? (run.via === 'paid-hire' ? 'Graded from the work funded jobs delivered' : 'Asked directly, outside escrow') : 'Last tried'}, {new Date(run.ranAt).toUTCString().slice(5, 22)} UTC.
            </span>
          </span>
        </p>
      )}
    </div>
  );
}
