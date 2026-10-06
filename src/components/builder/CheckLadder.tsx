import type { DiagnosticCheck } from '@/lib/diagnostic/checks';
import { cn } from '@/lib/ui/cn';

/*
 * The five rungs a listing climbs, in the order a builder fixes them. Each is
 * one of the diagnostic's own checks, so a rung never asserts anything the
 * check did not test. Category and attestations are checked too, and shown
 * after the ladder: they describe the listing rather than gate it.
 */
const RUNGS: { id: string; title: string; means: string }[] = [
  { id: 'identity', title: 'Registered', means: 'An ERC-8004 identity with an owner and an agent wallet.' },
  { id: 'endpoint', title: 'Reachable', means: 'The registry record names an A2A or MCP endpoint.' },
  { id: 'liveness', title: 'Answers when called', means: 'The endpoint returned well-formed JSON to Pokter’s probe.' },
  { id: 'card', title: 'Discoverable', means: 'An agent card with skills, so buyers read your words, not guesses.' },
  { id: 'quote', title: 'Priced', means: 'A signed quote that recovers to the agent wallet. Without it, buyers set the budget.' },
];

const MARK = {
  pass: { glyph: '✓', className: 'border-positive bg-positive text-canvas', word: 'Passed' },
  fail: { glyph: '!', className: 'border-negative bg-negative-dim text-negative', word: 'Needs attention' },
  unknown: { glyph: '·', className: 'border-line-strong bg-canvas text-ink-faint', word: 'Could not be run' },
} as const;

/**
 * The diagnostic report as a ladder: five automated checks, each with what
 * Pokter saw and what to change. The same report the old list drew, in an
 * order a builder can act on from the top down.
 */
export function CheckLadder({ checks, className }: { checks: DiagnosticCheck[]; className?: string }) {
  const byId = new Map(checks.map((check) => [check.id, check]));
  const rungs = RUNGS.map((rung) => ({ ...rung, check: byId.get(rung.id) ?? null }));
  const passed = rungs.filter((rung) => rung.check?.status === 'pass').length;
  const extras = checks.filter((check) => !RUNGS.some((rung) => rung.id === check.id));

  return (
    <section aria-labelledby="ladder-heading" className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="ladder-heading" className="text-body font-medium">
          Five checks, run just now
        </h3>
        <p className="tabular text-small text-ink-muted">
          <span className={passed === RUNGS.length ? 'font-medium text-positive' : 'font-medium text-ink'}>{passed} of {RUNGS.length}</span> passed
        </p>
      </div>

      <ol className="relative flex flex-col">
        {rungs.map((rung, index) => {
          const status = rung.check?.status ?? 'unknown';
          const mark = MARK[status];
          const last = index === rungs.length - 1;
          return (
            <li key={rung.id} className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
              {!last && <span aria-hidden className="absolute left-[13px] top-7 h-full w-px bg-line" />}
              <span aria-hidden className={cn('relative z-10 mt-0.5 grid size-7 place-items-center rounded-full border text-[12px] font-semibold', mark.className)}>
                {mark.glyph}
              </span>
              <div className={cn('flex min-w-0 flex-col gap-1', !last && 'pb-5')}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="mono text-caption text-ink-faint">{String(index + 1).padStart(2, '0')}</span>
                  <p className="text-body-s font-medium">{rung.title}</p>
                  <span className={cn('text-small', status === 'pass' ? 'text-positive' : status === 'fail' ? 'text-negative' : 'text-ink-faint')}>{mark.word}</span>
                </div>
                <p className="text-small text-ink-faint">{rung.means}</p>
                {rung.check && <p className="text-body-s leading-relaxed text-ink-secondary">{rung.check.detail}</p>}
                {rung.check?.remedy && status !== 'pass' && (
                  <div className="mt-1 rounded-md border border-line bg-canvas-subtle p-3 text-body-s leading-relaxed">
                    <p className="text-caption font-medium uppercase tracking-wide text-ink-faint">What to change</p>
                    <p className="mt-1 text-ink-secondary">{rung.check.remedy}</p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {extras.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-line pt-4">
          {extras.map((check) => {
            const mark = MARK[check.status];
            return (
              <li key={check.id} className="flex gap-3 text-body-s">
                <span aria-hidden className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold', mark.className)}>
                  {mark.glyph}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">
                    {check.label} <span className="font-normal text-ink-faint">· {mark.word.toLowerCase()}</span>
                  </p>
                  <p className="text-small leading-relaxed text-ink-muted">{check.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
