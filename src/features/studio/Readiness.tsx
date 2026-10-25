import Link from 'next/link';

import { readinessSummary, type ReadinessMilestone, type ReadinessState } from '@/lib/diagnostic/builder-lifecycle';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/icons';

const MARK: Record<ReadinessState, { icon: React.ReactNode; tone: string; word: string }> = {
  done: { icon: <Icon.Check size={13} />, tone: 'bg-ok text-paper', word: 'Done' },
  failed: { icon: <Icon.Cross size={12} />, tone: 'bg-bad text-paper', word: 'Failed' },
  todo: { icon: <Icon.Dash size={12} />, tone: 'border border-rule-strong text-ink-3', word: 'Not done' },
  /*
   * Deliberately not a cross. A quote cannot be asked for before an
   * identity exists, and marking that as a failure sent builders to fix
   * something that was never broken.
   */
  waiting: { icon: <Icon.Clock size={12} />, tone: 'border border-dashed border-rule-strong text-ink-3', word: 'Comes later' },
};

/**
 * The six milestones between an idea and money that arrived.
 *
 * Rendered as a list rather than a row of six chips on purpose: each
 * milestone carries what Pokter observed, why it is not done, the next
 * fix and a way to check it again, and a chip has room for none of that.
 * The previous five-up grid showed a label and a half-sentence, which is
 * how "Hireable" came to sit under a signed quote with nothing delivered.
 *
 * `onRetest` is optional because this renders in two places: the import
 * page holds a live diagnostic it can re-run in place, and a
 * server-rendered manage page can only link to it. Every milestone's
 * retest therefore carries a link as well.
 */
export function Readiness({
  milestones,
  onRetest,
  busy = false,
  title = 'Readiness',
}: {
  milestones: ReadinessMilestone[];
  onRetest?: (milestone: ReadinessMilestone) => void;
  busy?: boolean;
  title?: string;
}) {
  const summary = readinessSummary(milestones);
  const next = summary.remaining[0] ?? null;
  return (
    <section aria-labelledby="readiness-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="readiness-title" className="t-h3">
            {title}
          </h2>
          <p className="t-readout text-[12.5px] text-ink-3">
            {summary.done} of {summary.total} milestones
          </p>
        </div>
        <p className="text-[13.5px] text-ink-2">
          <span className="font-medium text-ink">{summary.headline}.</span> {summary.unproven}
        </p>
      </div>

      <ol className="ruled rounded-[14px] border border-rule bg-raised px-5">
        {milestones.map((milestone, i) => {
          const mark = MARK[milestone.state];
          const isNext = next?.id === milestone.id;
          return (
            <li
              key={milestone.id}
              aria-current={isNext ? 'step' : undefined}
              className={cn('flex items-start gap-3 py-3.5', isNext && '-mx-5 border-l-2 border-ink bg-sunken/40 px-5 pl-[18px]')}
            >
              <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full', mark.tone)} aria-hidden>
                {mark.icon}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-sm font-medium">
                  {i + 1}. {milestone.label}
                  <span className="sr-only">: {mark.word}</span>
                  <span
                    aria-hidden
                    className={cn(
                      'ml-2 text-[12px] font-normal',
                      milestone.state === 'failed' ? 'text-bad' : milestone.state === 'done' ? 'text-ok' : 'text-ink-3',
                    )}
                  >
                    {mark.word}
                  </span>
                  {isNext && <span className="ml-2 rounded-full bg-ink px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-paper">Next</span>}
                </p>
                <p className="text-[12.5px] leading-relaxed text-ink-2">{milestone.detail}</p>
                {milestone.reason && (
                  <p className="text-[12.5px] leading-relaxed text-ink-3">
                    <span className="font-medium text-ink-2">Why: </span>
                    {milestone.reason}
                  </p>
                )}
                {milestone.fix && (
                  <p className="text-[12.5px] leading-relaxed text-ink-3">
                    <span className="font-medium text-ink-2">Fix: </span>
                    {milestone.fix}
                  </p>
                )}
                {milestone.retest && (
                  <p className="mt-0.5">
                    {onRetest && milestone.retest.kind === 'recheck' ? (
                      <Button size="s" intent="secondary" busy={busy} onClick={() => onRetest(milestone)} icon={<Icon.Refresh size={13} />}>
                        {milestone.retest.label}
                      </Button>
                    ) : milestone.retest.href ? (
                      <Link href={milestone.retest.href} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
                        {milestone.retest.label} <Icon.Arrow size={12} aria-hidden />
                      </Link>
                    ) : null}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="text-[12px] leading-relaxed text-ink-3">
        Each milestone says what Pokter observed, and nothing claims the next one. An agent part-way up stays listed and
        discoverable: its public page shows the evidence it has earned and names what it has not. Delivery and settlement
        are things that happened, so they stay earned even while the endpoint is down — the line above says whether a buyer
        could hire it right now. A test job you funded yourself proves the mechanism and is never counted as customer demand.
      </p>
    </section>
  );
}

/** While the checks are running: the shape that is coming, with nothing claimed. */
export function ReadinessSkeleton() {
  return (
    <section aria-labelledby="readiness-loading" className="flex flex-col gap-4">
      <h2 id="readiness-loading" className="t-h3">
        Readiness
      </h2>
      <ol className="ruled rounded-[14px] border border-rule bg-raised px-5" role="status" aria-label="Checking readiness">
        {['Built', 'Public endpoint checked', 'Identity and signing wallet', 'Signed quote Pokter can pay', 'Funded test job delivered', 'Settlement confirmed'].map((label) => (
          <li key={label} className="flex items-center gap-3 py-3.5">
            <span className="size-6 shrink-0 rounded-full border border-dashed border-rule-strong" aria-hidden />
            <span className="text-sm text-ink-3">{label}</span>
          </li>
        ))}
      </ol>
      <p className="text-[12.5px] text-ink-3">Calling the endpoint, asking for a price, and reading this agent&rsquo;s jobs from escrow.</p>
    </section>
  );
}
