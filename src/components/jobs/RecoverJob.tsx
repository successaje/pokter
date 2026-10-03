'use client';

import { useState } from 'react';
import { formatUnits } from 'viem';

import { useActiveWallet } from '@/lib/wallet/active';
import { rememberJob } from '@/lib/wallet/activity';
import { formatBudget } from '@/lib/erc8183/pricing';
import { shortAddress } from '@/lib/ui/format';
import type { HiredJob } from '@/lib/erc8183/types';
import { cn } from '@/lib/ui/cn';

type Found = { job: HiredJob; client: string };

/**
 * Bring a job back that this browser has never seen.
 *
 * The page has always said an escrowed job hired elsewhere can be recovered
 * from chain by its ID, and never offered anywhere to type one. Records live
 * in this browser's storage, so a hire made on a phone is invisible on a
 * laptop and the instruction was a description of something that could not
 * be done.
 */
export function RecoverJob() {
  const active = useActiveWallet();
  const [jobId, setJobId] = useState('');
  const [state, setState] = useState<'idle' | 'looking' | 'found' | 'error'>('idle');
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const look = async () => {
    setState('looking');
    setError(null);
    setFound(null);
    setAdded(false);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId.trim())}`);
      const body = (await response.json()) as Partial<Found> & { error?: string };
      if (!response.ok || !body.job) {
        setError(body.error ?? 'That job could not be read.');
        setState('error');
        return;
      }
      setFound({ job: body.job, client: body.client ?? '' });
      setState('found');
    } catch {
      setError('The lookup did not complete. Check your connection and try again.');
      setState('error');
    }
  };

  /*
   * Only the wallet that funded it may file it here.
   *
   * Not secrecy — the chain is public and this endpoint reads it for
   * anybody. It is that "your activity" means yours: adding a job somebody
   * else paid for would put their escrow, their brief and their money in
   * your list, and every control on the card would then be offered to a
   * wallet that cannot use them.
   */
  const isMine =
    Boolean(found && active.address) &&
    found!.client.toLowerCase() === active.address!.toLowerCase();

  const add = () => {
    if (!found || !active.address || !isMine) return;
    rememberJob(active.address, found.job);
    setAdded(true);
  };

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <div>
        <h2 className="text-[13px] font-semibold">Recover a job by ID</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
          Jobs are remembered in this browser. One you funded on another
          device will not appear here until you bring it back.
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (/^\d+$/.test(jobId.trim())) void look();
        }}
      >
        <input
          value={jobId}
          onChange={(event) => setJobId(event.target.value.replace(/[^\d]/g, ''))}
          inputMode="numeric"
          placeholder="1372"
          aria-label="Job ID"
          className="mono h-11 w-32 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3 text-sm outline-none focus:border-[color:var(--border-focus)]"
        />
        <button
          type="submit"
          disabled={state === 'looking' || !/^\d+$/.test(jobId.trim())}
          className="min-h-11 rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 text-[13px] font-medium transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-45"
        >
          {state === 'looking' ? 'Reading chain…' : 'Find job'}
        </button>
      </form>

      {error && (
        <p className="text-[12px] leading-relaxed text-[color:var(--caution)]">{error}</p>
      )}

      {found && (
        <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-3">
          <p className="text-[12px]">
            <span className="font-medium">{found.job.agentName}</span>
            <span className="text-[color:var(--text-muted)]">
              {` · ${found.job.status.toLowerCase()} · ${formatBudget(Number(formatUnits(BigInt(found.job.budgetRaw), 18)))}`}
            </span>
          </p>
          <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
            {`Funded by ${shortAddress(found.client)}.`}
          </p>

          {added ? (
            <p className="text-[12px] font-medium text-[color:var(--positive)]">
              Added. It is in the list below and will refresh with the others.
            </p>
          ) : !active.address ? (
            <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
              Connect the wallet that funded this job to add it to this device.
            </p>
          ) : isMine ? (
            <button
              type="button"
              onClick={add}
              className={cn(
                'min-h-10 w-fit rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 text-[12px] font-medium',
                'transition-colors hover:bg-[color:var(--surface-hover)]',
              )}
            >
              Add to this device
            </button>
          ) : (
            <p className="text-[12px] leading-relaxed text-[color:var(--caution)]">
              {`This job was funded by ${shortAddress(found.client)}, not by the wallet you have connected. Switch to that wallet to add it.`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
