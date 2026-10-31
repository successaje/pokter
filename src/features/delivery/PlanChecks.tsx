import { planCheckCounts, type PlanCheckOutcome, type PlanCheckReport } from '@/lib/delivery/plan-checks';
import { cn } from '@/lib/ui/cn';

/*
 * What Pokter checked in a delivered answer, check by check.
 *
 * Each row says what was compared, not just that it passed, because a pass
 * means that comparison held and nothing wider: a grid whose levels follow
 * from its range is not thereby a grid that makes money. The rows keep the
 * order the checker runs them in, which reads as the plan does; the counts
 * above them carry the tally.
 */

const OUTCOME: Record<PlanCheckOutcome, { label: string; badge: string }> = {
  passed: { label: 'Passed', badge: 'bg-ok-wash text-ink' },
  failed: { label: 'Failed', badge: 'bg-bad-wash text-ink' },
  'not-verified': { label: 'Not verified', badge: 'bg-watch-wash text-ink' },
  'not-applicable': { label: 'Not applicable', badge: 'bg-sunken text-ink-3' },
};

export function planCheckTally(report: PlanCheckReport): string {
  const counts = planCheckCounts(report);
  return (Object.keys(OUTCOME) as PlanCheckOutcome[])
    .filter((outcome) => counts[outcome] > 0)
    .map((outcome) => `${counts[outcome]} ${OUTCOME[outcome].label.toLowerCase()}`)
    .join(' · ');
}

/** `tally` off where the caller already shows it, as the profile's folded summary does. */
export function PlanChecks({ report, tally = true }: { report: PlanCheckReport; tally?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {tally && (
        <p className="text-[13.5px] text-ink-2">
          <span className="font-medium text-ink">{report.label}</span> · {planCheckTally(report)}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {report.checks.map((c) => (
          <li key={c.id} className="flex flex-col gap-1 py-3">
            <span className="flex items-start justify-between gap-3">
              <span className="font-medium text-ink">{c.label}</span>
              <span className={cn('inline-block shrink-0 whitespace-nowrap rounded-[5px] px-1.5 py-px text-[11.5px] font-medium', OUTCOME[c.outcome].badge)}>{OUTCOME[c.outcome].label}</span>
            </span>
            <span className="break-words text-[13.5px] text-ink-2">{c.detail}</span>
            <span className="text-[12.5px] text-ink-3">Compared: {c.tested}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1 text-[13px] text-ink-3">
        <p className="font-medium text-ink-2">Not checked here</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {report.notCovered.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>
          Method <span className="t-readout">{report.method}</span>. These checks read the delivered answer and the brief, so anyone can repeat them from the record; they do not go out of date.
        </p>
      </div>
    </div>
  );
}
