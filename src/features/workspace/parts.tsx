'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatUnits } from 'viem';

import type { HiredJob } from '@/lib/erc8183/types';
import { cn } from '@/lib/ui/cn';
import { formatElapsed } from '@/lib/ui/format';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { useWalletState } from '@/shell/wallet/useWalletState';
import { AgentAvatar } from '@/ui/Agent';
import { Button, LinkButton } from '@/ui/Button';
import { EmptyState, Skeleton } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { jobPhase, PHASE } from './hooks';

const DOT = { ok: 'bg-ok', watch: 'bg-watch', info: 'bg-info', bad: 'bg-bad', none: 'bg-rule-strong' } as const;
const TEXT = { ok: 'text-ok', watch: 'text-watch', info: 'text-info', bad: 'text-bad', none: 'text-ink-3' } as const;

export function PageHeader({ title, description, action, label }: { title: string; description?: ReactNode; action?: ReactNode; label?: string }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-2xl flex-col gap-1.5">
        {label && <span className="t-label">{label}</span>}
        <h1 className="t-h1">{title}</h1>
        {description && <p className="text-[14.5px] leading-relaxed text-ink-2">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function PhaseLabel({ job, className }: { job: HiredJob; className?: string }) {
  const phase = PHASE[jobPhase(job)];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] font-medium', TEXT[phase.tone], className)}>
      <span className={cn('size-1.5 rounded-full', DOT[phase.tone], phase.tone === 'info' && 'pulse')} aria-hidden />
      {phase.label}
    </span>
  );
}

export function budgetOf(job: HiredJob) {
  try {
    return `${Number(formatUnits(BigInt(job.budgetRaw), 18)).toLocaleString('en-US', { maximumFractionDigits: 4 })} $U`;
  } catch {
    return '—';
  }
}

export function timeLeft(job: HiredJob, now = Date.now()) {
  const ms = Date.parse(job.expiredAt) - now;
  if (ms <= 0) return 'deadline passed';
  return `${formatElapsed(ms)} left`;
}

export function JobRow({ job }: { job: HiredJob }) {
  const phase = jobPhase(job);
  return (
    <Link
      href={`/workspace/jobs/${job.jobId}`}
      className="group grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-4 transition-colors hover:bg-sunken/40 sm:grid-cols-[36px_minmax(0,1.4fr)_minmax(0,1fr)_110px_20px]"
    >
      <AgentAvatar name={job.agentName} seed={`${job.agentChainId}:${job.agentTokenId}`} size={36} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14.5px] font-medium">{job.agentName}</span>
        <span className="truncate text-[12.5px] text-ink-3">
          Job #{job.jobId} · {job.task.replace(/\s+/g, ' ').slice(0, 80)}
        </span>
      </span>
      <span className="col-start-2 flex flex-col sm:col-start-auto">
        <PhaseLabel job={job} />
        <span className="text-[12px] text-ink-3">{phase === 'working' ? timeLeft(job) : new Date(job.statusCheckedAt ?? job.hiredAt).toLocaleDateString()}</span>
      </span>
      <span className="t-readout row-start-1 text-right text-[13px] sm:row-start-auto">{budgetOf(job)}</span>
      <Icon.ChevronRight size={16} className="hidden text-ink-3 transition-transform group-hover:translate-x-0.5 sm:block" />
    </Link>
  );
}

/**
 * The workspace without a wallet: what it is for, and the one action. It
 * never pretends there is nothing to show when it simply cannot look.
 */
export function NeedsWallet({ what }: { what: string }) {
  const { openConnect } = useConnect();
  const w = useWalletState();
  if (!w.hydrated || !w.ready) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  return (
    <EmptyState
      title={w.wrongChain ? 'Your wallet is on another network' : `Connect a wallet to see ${what}`}
      action={
        <>
          <Button onClick={() => openConnect(`to see ${what}`)} icon={<Icon.Wallet size={16} />}>
            {w.wrongChain ? 'Switch network' : 'Connect a wallet'}
          </Button>
          <LinkButton href="/discover" intent="ghost">
            Find an agent first
          </LinkButton>
        </>
      }
    >
      Your hires live on chain, tied to the wallet that funded them. Pokter remembers them on this device and can recover any job by its number.
    </EmptyState>
  );
}

export function Stat({ label, value, note, href, tone }: { label: string; value: ReactNode; note?: ReactNode; href?: string; tone?: 'watch' }) {
  const body = (
    <>
      <span className="t-label">{label}</span>
      <span className={cn('t-readout text-[1.6rem] leading-none tracking-[-0.03em]', tone === 'watch' && 'text-watch')}>{value}</span>
      {note && <span className="text-[12.5px] text-ink-3">{note}</span>}
    </>
  );
  const cls = 'flex flex-col gap-2 rounded-[14px] border border-rule bg-raised p-5';
  return href ? (
    <Link href={href} className={cn(cls, 'transition-colors hover:border-rule-strong')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
