import { cn } from '@/lib/ui/cn';
import type { JobStatusName } from '@/lib/erc8183/types';

/**
 * The escrow lifecycle, drawn as a track.
 *
 * Terminal states are not "later stages" of the happy path — EXPIRED and
 * REJECTED end the job — so they replace the track rather than appearing as a
 * further step along it.
 */
const HAPPY_PATH: JobStatusName[] = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED'];

const STATE_COLOR: Record<JobStatusName, string> = {
  OPEN: 'var(--text-muted)',
  FUNDED: 'var(--info)',
  SUBMITTED: 'var(--caution)',
  COMPLETED: 'var(--positive)',
  REJECTED: 'var(--negative)',
  EXPIRED: 'var(--negative)',
};

export function JobStatusTrack({ status }: { status: JobStatusName }) {
  const terminal = status === 'REJECTED' || status === 'EXPIRED';

  if (terminal) {
    return (
      <div
        className="flex items-center gap-2 rounded-[var(--radius)] border px-3 py-2"
        style={{
          borderColor: 'color-mix(in srgb, var(--negative) 35%, transparent)',
          background: 'var(--negative-dim)',
        }}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-[color:var(--negative)]" />
        <span className="text-[11px] font-medium text-[color:var(--negative)]">
          {status === 'EXPIRED'
            ? 'Expired — the agent never delivered. Escrow is reclaimable.'
            : 'Rejected — the delivery was contested.'}
        </span>
      </div>
    );
  }

  const reached = HAPPY_PATH.indexOf(status);

  return (
    <ol className="flex items-center gap-1.5">
      {HAPPY_PATH.map((stage, index) => {
        const done = index <= reached;
        const current = index === reached;

        return (
          <li key={stage} className="flex flex-1 flex-col gap-1.5">
            <span
              aria-hidden
              className={cn('h-0.5 w-full rounded-full transition-colors')}
              style={{
                background: done ? STATE_COLOR[status] : 'var(--border)',
              }}
            />
            <span
              className={cn(
                'text-[10px] uppercase tracking-wide',
                current ? 'font-medium' : '',
              )}
              style={{
                color: current
                  ? STATE_COLOR[status]
                  : done
                    ? 'var(--text-muted)'
                    : 'var(--text-faint)',
              }}
            >
              {stage}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
