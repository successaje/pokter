'use client';

import { useState } from 'react';
import { formatUnits } from 'viem';

import { shortAddress, shortHash } from '@/lib/ui/format';
import { JOB_STAGE_COPY, type HiredJob } from '@/lib/erc8183/types';
import { JobStatusTrack } from './JobStatus';

/**
 * §55 / §58. A commissioned job.
 *
 * Status is never assumed from elapsed time: Refresh re-reads the kernel, and
 * everything shown is either read from chain or recorded at hire time.
 */
export function JobCard({
  job: initial,
  explorerBase,
}: {
  job: HiredJob;
  explorerBase: string;
}) {
  const [job, setJob] = useState(initial);
  const [busy, setBusy] = useState<null | 'refresh' | 'approve'>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: 'refresh' | 'approve') => {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(
        `/api/hire?id=${encodeURIComponent(job.id)}&action=${action}`,
        { method: 'PATCH' },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `${action} failed.`);
      setJob(body.job as HiredJob);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const budget = formatUnits(BigInt(job.budgetRaw), 18);
  const settleable = job.status === 'SUBMITTED';

  return (
    <article className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-sm font-medium">{job.agentName}</h3>
          <p className="mono text-[11px] text-[color:var(--text-faint)]">
            Job #{job.jobId} · provider {shortAddress(job.provider)}
            {job.isTestnet && ' · testnet'}
          </p>
        </div>
        <span className="tabular text-sm">{budget} $U</span>
      </header>

      <JobStatusTrack status={job.status} />

      <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
        {JOB_STAGE_COPY[job.status]}
      </p>

      <details className="group">
        <summary className="cursor-pointer text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--text)]">
          Task brief
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg)] p-3 text-[10px] leading-relaxed text-[color:var(--text-secondary)]">
          {job.task}
        </pre>
      </details>

      {job.deliverableUrl && (
        <a
          href={job.deliverableUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="w-fit rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
        >
          View deliverable →
        </a>
      )}

      <dl className="flex flex-col gap-1 border-t border-[color:var(--border)] pt-3 text-[11px]">
        <div className="flex justify-between gap-3">
          <dt className="text-[color:var(--text-faint)]">Expires</dt>
          <dd className="mono">
            {job.expiredAt.slice(0, 16).replace('T', ' ')} UTC
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[color:var(--text-faint)]">Status read</dt>
          <dd className="mono">
            {job.statusCheckedAt.slice(11, 19)} UTC
          </dd>
        </div>
        {job.hireTxHash && (
          <div className="flex justify-between gap-3">
            <dt className="text-[color:var(--text-faint)]">Hire tx</dt>
            <dd>
              <a
                href={`${explorerBase}/tx/${job.hireTxHash}`}
                target="_blank"
                rel="noreferrer noopener"
                className="mono text-[color:var(--info)] underline decoration-dotted underline-offset-2"
              >
                {shortHash(job.hireTxHash)}
              </a>
            </dd>
          </div>
        )}
        {job.settleTxHash && (
          <div className="flex justify-between gap-3">
            <dt className="text-[color:var(--text-faint)]">Settle tx</dt>
            <dd>
              <a
                href={`${explorerBase}/tx/${job.settleTxHash}`}
                target="_blank"
                rel="noreferrer noopener"
                className="mono text-[color:var(--info)] underline decoration-dotted underline-offset-2"
              >
                {shortHash(job.settleTxHash)}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {error && (
        <p className="rounded-[var(--radius)] border border-[color:var(--negative)]/30 bg-[color:var(--negative-dim)] p-2.5 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => act('refresh')}
          disabled={busy !== null}
          className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
        >
          {busy === 'refresh' ? 'Reading chain…' : 'Refresh status'}
        </button>

        {settleable && (
          <button
            type="button"
            onClick={() => act('approve')}
            disabled={busy !== null}
            className="rounded-[var(--radius)] bg-[color:var(--positive)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'approve' ? 'Releasing…' : 'Release escrow'}
          </button>
        )}
      </div>
    </article>
  );
}
