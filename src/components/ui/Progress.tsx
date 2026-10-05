import { cn } from '@/lib/ui/cn';

export interface Stage {
  id: string;
  label: string;
  /** A second line: what is happening, or what happened. */
  detail?: string;
}

/**
 * Staged progress for anything that touches the chain. The stages are listed
 * top to bottom and fill in as they complete; the current one carries a
 * live dot. A spinner alone tells the user nothing about where they are.
 */
export function StagedProgress({ stages, current, failedAt, className }: { stages: Stage[]; current: number; failedAt?: number | null; className?: string }) {
  return (
    <ol className={cn('flex flex-col', className)} aria-label="Progress">
      {stages.map((stage, index) => {
        const done = index < current;
        const active = index === current && failedAt == null;
        const failed = failedAt === index;
        const last = index === stages.length - 1;
        return (
          <li key={stage.id} className="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3" aria-current={active ? 'step' : undefined}>
            {!last && <span aria-hidden className={cn('absolute left-[7px] top-4 h-full w-px', done ? 'bg-ink' : 'bg-line')} />}
            <span
              aria-hidden
              className={cn(
                'relative z-10 mt-1 grid size-4 place-items-center rounded-full border-2 text-[9px] font-bold',
                done && 'border-ink bg-ink text-canvas',
                active && 'border-ink bg-surface',
                failed && 'border-negative bg-negative text-canvas',
                !done && !active && !failed && 'border-line-strong bg-surface',
              )}
            >
              {done ? '✓' : failed ? '!' : active ? <span className="live-dot size-1.5 rounded-full bg-ink" /> : null}
            </span>
            <div className={cn('min-w-0', !last && 'pb-4')}>
              <p className={cn('text-body-s', done || active ? 'font-medium text-ink' : failed ? 'font-medium text-negative' : 'text-ink-faint')}>{stage.label}</p>
              {stage.detail && (active || failed) && <p className={cn('mt-0.5 text-small', failed ? 'text-negative' : 'text-ink-muted')}>{stage.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
