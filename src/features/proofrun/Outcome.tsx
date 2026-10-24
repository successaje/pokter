import type { CheckResult } from '@/lib/shared/contracts';
import { cn } from '@/lib/ui/cn';

import { OUTCOME_COPY } from './catalogue';

/*
 * Three outcomes, three shapes.
 *
 * Shape and not only colour, for the reason `ui/Verdict.tsx` gives: the
 * states have to survive greyscale, a colour-blind reader and a printed
 * page. A filled disc for a comparison that ran and agreed, a cross for one
 * that ran and disagreed, and a dashed ring for one that did not run —
 * borrowed from `unproven`, which carries the same meaning there: an
 * absence of measurement, and a statement about Pokter rather than about
 * the agent.
 *
 * There is no fourth mark and no partial one. A ring that looked like
 * "nearly passed" would invite exactly the reading the three-outcome rule
 * exists to forbid.
 */

type Outcome = CheckResult['outcome'];

const TONE_TEXT: Record<Outcome, string> = {
  passed: 'text-ok',
  failed: 'text-bad',
  'not-verified': 'text-ink-3',
};

const TONE_WASH: Record<Outcome, string> = {
  passed: 'bg-ok-wash text-ink',
  failed: 'bg-bad-wash text-ink',
  'not-verified': 'bg-none-wash text-ink-2',
};

export function OutcomeGlyph({ outcome, size = 10 }: { outcome: Outcome; size?: number }) {
  const s = size;
  const c = s / 2;
  const r = s / 2 - 1;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden className={cn('shrink-0', TONE_TEXT[outcome])}>
      {outcome === 'passed' && <circle cx={c} cy={c} r={r} fill="currentColor" />}
      {outcome === 'failed' && (
        <path
          d={`M1.5 1.5 L${s - 1.5} ${s - 1.5} M${s - 1.5} 1.5 L1.5 ${s - 1.5}`}
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      )}
      {outcome === 'not-verified' && (
        <circle cx={c} cy={c} r={r - 0.5} fill="none" stroke="currentColor" strokeWidth="1.25" strokeDasharray="1.6 1.6" />
      )}
    </svg>
  );
}

/** The outcome as a chip. The word is always present: the glyph never stands alone. */
export function OutcomeChip({ outcome, className }: { outcome: Outcome; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium',
        TONE_WASH[outcome],
        className,
      )}
      title={OUTCOME_COPY[outcome].meaning}
    >
      <OutcomeGlyph outcome={outcome} />
      {OUTCOME_COPY[outcome].label}
    </span>
  );
}

/**
 * The count of each outcome, and nothing composed from them.
 *
 * Three figures side by side rather than a rate or a score. "5 of 7" is a
 * fact about this run; a percentage invites comparison between runs with
 * different criteria, and a score invites the reader to treat two
 * not-verifieds as half a pass. Both are refused here deliberately — see
 * `PROOFRUN_DOES_NOT_MEAN`.
 */
export function OutcomeTally({ checks, className }: { checks: readonly CheckResult[]; className?: string }) {
  const order: Outcome[] = ['passed', 'failed', 'not-verified'];
  const counts = new Map<Outcome, number>(order.map((outcome) => [outcome, 0]));
  for (const check of checks) counts.set(check.outcome, (counts.get(check.outcome) ?? 0) + 1);

  return (
    <dl className={cn('flex flex-wrap gap-2', className)}>
      {order.map((outcome) => {
        const count = counts.get(outcome) ?? 0;
        return (
          <div
            key={outcome}
            className={cn(
              'flex min-w-0 items-baseline gap-2 rounded-[8px] border border-rule px-2.5 py-1.5',
              count === 0 && 'opacity-55',
            )}
          >
            <dt className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
              <OutcomeGlyph outcome={outcome} size={9} />
              {OUTCOME_COPY[outcome].label}
            </dt>
            <dd className="t-readout text-[14px] text-ink">
              {count}
              <span className="sr-only"> of {checks.length} checks</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
