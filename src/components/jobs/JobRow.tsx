'use client';

import { formatUnits } from 'viem';
import { useId, useState } from 'react';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { JobCard } from '@/components/jobs/JobCard';
import { cn } from '@/lib/ui/cn';
import type { HiredJob, JobStatusName } from '@/lib/erc8183/types';

/**
 * A job as one line, opening to the whole record.
 *
 * The full card is four hundred lines of evidence — lifecycle, identity,
 * provider, receipt, dispute controls — and stacking several of them meant
 * scrolling past everything about job one to learn whether job two had been
 * delivered. The summary answers that in a line; the record is a click away
 * and unchanged when you want it.
 */
const TONE: Record<JobStatusName, string> = {
  OPEN: 'border-[color:var(--border-strong)] text-[color:var(--text-muted)]',
  FUNDED: 'border-[color:var(--info)]/40 bg-[color:var(--info-dim)] text-[color:var(--info)]',
  SUBMITTED: 'border-[color:var(--brand)]/40 bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand)]',
  COMPLETED: 'border-[color:var(--positive)]/40 bg-[color:var(--positive-dim)] text-[color:var(--positive)]',
  REJECTED: 'border-[color:var(--negative)]/40 bg-[color:var(--negative-dim)] text-[color:var(--negative)]',
  EXPIRED: 'border-[color:var(--caution)]/40 bg-[color:var(--caution-dim)] text-[color:var(--caution)]',
};

const LABEL: Record<JobStatusName, string> = {
  OPEN: 'Open',
  FUNDED: 'Active',
  SUBMITTED: 'Delivered',
  COMPLETED: 'Completed',
  REJECTED: 'Contested',
  EXPIRED: 'Expired',
};

function day(iso: string): string {
  return iso.slice(0, 10);
}

export function JobRow({
  job,
  explorerBase,
}: {
  job: HiredJob;
  explorerBase: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const budget = Number(formatUnits(BigInt(job.budgetRaw), 18)).toFixed(2);

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-[color:var(--surface-hover)]"
      >
        <AgentAvatar name={job.agentName} src={null} size="sm" />

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold [overflow-wrap:anywhere]">
              {job.agentName}
            </span>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                TONE[job.status],
              )}
            >
              {LABEL[job.status]}
            </span>
          </span>

          <span className="line-clamp-2 text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
            {job.task}
          </span>

          <span className="mono flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[color:var(--text-faint)]">
            <span>Job #{job.jobId}</span>
            <span>Started {day(job.hiredAt)}</span>
            {job.settleTxHash && <span>Settled</span>}
            <span className="text-[color:var(--text-secondary)]">
              {budget} $U
            </span>
          </span>
        </span>

        <span
          aria-hidden
          className={cn(
            'mt-1 shrink-0 text-[color:var(--text-faint)] transition-transform',
            open && 'rotate-180',
          )}
        >
          <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {/*
        Mounted only when open. The card reads chain state and renders dispute
        controls; keeping several of them alive behind a hidden style would do
        that work for jobs nobody is looking at.
      */}
      {open && (
        <div id={panelId} className="border-t border-[color:var(--border)] p-4">
          <JobCard job={job} explorerBase={explorerBase} />
        </div>
      )}
    </div>
  );
}
