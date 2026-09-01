'use client';

import { useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { shortAddress, shortHash } from '@/lib/ui/format';
import { JOB_STAGE_COPY, type HiredJob } from '@/lib/erc8183/types';
import { JobStatusTrack } from '@/components/jobs/JobStatus';

/**
 * A provider the escrow can actually reach.
 *
 * The marketplace indexes agents on BSC mainnet, while the ERC-8183 escrow we
 * can fund runs on testnet. A job created on chain 97 is invisible to a runtime
 * listening on chain 56, so commissioning against a mainnet agent's wallet
 * would produce a real transaction that no one will ever answer. Rather than
 * hide that, the panel says so and offers a provider that is demonstrably live
 * on the escrow chain.
 */
export interface ProviderChoice {
  address: string;
  label: string;
  note: string;
  reachable: boolean;
}

export function CommissionPanel({
  agent,
  providers,
  escrowChainId,
  explorerBase,
}: {
  agent: { chainId: number; tokenId: string; name: string };
  providers: ProviderChoice[];
  escrowChainId: number;
  explorerBase: string;
}) {
  const [providerAddress, setProviderAddress] = useState(
    providers.find((p) => p.reachable)?.address ?? providers[0]?.address ?? '',
  );
  const [task, setTask] = useState(
    `Rank current Venus supply yields for USDT on BNB Chain. Include net APY and state any assumption you had to make.`,
  );
  const [budget, setBudget] = useState(0.1);

  const [state, setState] = useState<'idle' | 'hiring' | 'hired' | 'error'>('idle');
  const [job, setJob] = useState<HiredJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const provider = providers.find((p) => p.address === providerAddress);

  const commission = async () => {
    setState('hiring');
    setError(null);
    try {
      const response = await fetch('/api/hire', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: providerAddress,
          agentName: provider?.label ?? agent.name,
          agentTokenId: agent.tokenId,
          budgetU: budget,
          task,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Hire failed.');
      setJob(body.job as HiredJob);
      setState('hired');
    } catch (caught) {
      setError((caught as Error).message);
      setState('error');
    }
  };

  const refresh = async () => {
    if (!job) return;
    setRefreshing(true);
    try {
      const response = await fetch(
        `/api/hire?id=${encodeURIComponent(job.id)}&action=refresh`,
        { method: 'PATCH' },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Refresh failed.');
      setJob(body.job as HiredJob);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Commission work</h3>
        <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          Funds a job on the ERC-8183 escrow. The budget is held by the kernel
          and released only after the agent delivers.
        </p>
      </div>

      {provider && !provider.reachable && (
        <p className="rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-3 text-[11px] leading-relaxed text-[color:var(--caution)]">
          {agent.name} is registered on chain {agent.chainId}, but the escrow we
          can fund runs on chain {escrowChainId}. A job created here would be a
          real transaction that this agent&apos;s runtime never sees. Pick a
          provider live on the escrow chain to see the flow actually complete.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs text-[color:var(--text-muted)]">Provider</span>
        <div className="flex flex-col gap-2">
          {providers.map((option) => (
            <button
              key={option.address}
              type="button"
              onClick={() => setProviderAddress(option.address)}
              disabled={state === 'hiring' || state === 'hired'}
              className={cn(
                'flex flex-col gap-0.5 rounded-[var(--radius)] border p-3 text-left transition-colors',
                providerAddress === option.address
                  ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)]'
                  : 'border-[color:var(--border)] hover:border-[color:var(--border-strong)]',
              )}
            >
              <span className="flex items-center gap-2 text-[12px] font-medium">
                {option.label}
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
                  style={{
                    background: option.reachable
                      ? 'var(--positive-dim)'
                      : 'var(--caution-dim)',
                    color: option.reachable ? 'var(--positive)' : 'var(--caution)',
                  }}
                >
                  {option.reachable ? 'on escrow chain' : 'different chain'}
                </span>
              </span>
              <span className="mono text-[10px] text-[color:var(--text-faint)]">
                {shortAddress(option.address)}
              </span>
              <span className="text-[10px] leading-relaxed text-[color:var(--text-muted)]">
                {option.note}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="task" className="text-xs text-[color:var(--text-muted)]">
          Task
        </label>
        <textarea
          id="task"
          rows={3}
          value={task}
          disabled={state === 'hiring' || state === 'hired'}
          onChange={(event) => setTask(event.target.value)}
          className="rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] p-2.5 text-[12px] leading-relaxed"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="budget" className="text-xs text-[color:var(--text-muted)]">
          Budget
        </label>
        <div className="flex items-center gap-2">
          <input
            id="budget"
            type="number"
            min={0.01}
            max={5}
            step={0.05}
            value={budget}
            disabled={state === 'hiring' || state === 'hired'}
            onChange={(event) => setBudget(Number(event.target.value))}
            className="mono w-28 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-2.5 py-1.5 text-[13px]"
          />
          <span className="text-[13px] text-[color:var(--text-muted)]">$U escrowed</span>
        </div>
      </div>

      {error && (
        <div className="rounded-[var(--radius)] border border-[color:var(--negative)]/30 bg-[color:var(--negative-dim)] p-3">
          <p className="text-[11px] font-medium text-[color:var(--negative)]">
            The job was not created
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
            {error}
          </p>
        </div>
      )}

      {state !== 'hired' && (
        <button
          type="button"
          onClick={commission}
          disabled={state === 'hiring' || !providerAddress || task.trim().length === 0}
          className="w-fit rounded-[var(--radius)] bg-[color:var(--text)] px-4 py-2 text-[13px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {state === 'hiring' ? 'Funding escrow…' : `Commission for ${budget} $U`}
        </button>
      )}

      {job && (
        <div className="flex flex-col gap-3 border-t border-[color:var(--border)] pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-medium text-[color:var(--positive)]">
              Job #{job.jobId} created
            </span>
            <span className="mono text-[10px] text-[color:var(--text-faint)]">
              chain {job.chainId}
              {job.isTestnet && ' · testnet'}
            </span>
          </div>

          <JobStatusTrack status={job.status} />

          <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
            {JOB_STAGE_COPY[job.status]}
          </p>

          {job.hireTxHash && (
            <a
              href={`${explorerBase}/tx/${job.hireTxHash}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mono w-fit text-[11px] text-[color:var(--info)] underline decoration-dotted underline-offset-2"
            >
              {shortHash(job.hireTxHash)}
            </a>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
            >
              {refreshing ? 'Reading chain…' : 'Refresh status'}
            </button>
            <a
              href="/my-agents"
              className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[12px] transition-colors hover:bg-[color:var(--surface-hover)]"
            >
              View in My agents →
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
