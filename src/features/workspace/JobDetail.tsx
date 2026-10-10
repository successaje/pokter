'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { HiredJob } from '@/lib/erc8183/types';
import { jobTimeline } from '@/lib/jobs/timeline';
import { useJobActions } from '@/lib/jobs/useJobActions';
import { chainLabel, explorerTxUrl } from '@/lib/network/presentation';
import { supportMailto } from '@/lib/support/contact';
import { cn } from '@/lib/ui/cn';
import { formatElapsed } from '@/lib/ui/format';
import { rememberJob } from '@/lib/wallet/activity';
import { AgentAvatar } from '@/ui/Agent';
import { Button, LinkButton } from '@/ui/Button';
import { Breadcrumbs } from '@/ui/Controls';
import { Address, Details, TxLink } from '@/ui/Data';
import { EmptyState, Notice, Skeleton } from '@/ui/Feedback';
import { Checkbox } from '@/ui/Field';
import { Icon } from '@/ui/icons';
import { jobPhase, PHASE, STATUS_NAME, useMyJobs } from './hooks';
import { budgetOf, PhaseLabel } from './parts';
import { ReviewForm } from './ReviewForm';

/**
 * Finds the job in this device's memory, or rebuilds it from chain. A job
 * page must never be a dead end because a browser forgot something.
 */
export function JobDetailLoader({ jobId }: { jobId: string }) {
  const { jobs, address, ready } = useMyJobs();
  const local = jobs.find((j) => j.jobId === jobId) ?? null;
  const [remote, setRemote] = useState<{ job: HiredJob; client: string } | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'missing' | 'error'>('idle');

  useEffect(() => {
    if (!ready || local || state !== 'idle') return;
    setState('loading');
    fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 404) return setState('missing');
        const body = (await r.json()) as { job?: HiredJob; client?: string };
        if (!r.ok || !body.job) return setState('error');
        setRemote({ job: body.job, client: body.client ?? '' });
        if (address && body.client && body.client.toLowerCase() === address.toLowerCase()) rememberJob(address, body.job);
        setState('idle');
      })
      .catch(() => setState('error'));
  }, [ready, local, jobId, address, state]);

  const job = local ?? remote?.job ?? null;
  if (!ready || (!job && (state === 'loading' || state === 'idle'))) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Loading job">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-12 w-80 max-w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!job) {
    return (
      <EmptyState
        tone={state === 'error' ? 'bad' : 'neutral'}
        title={state === 'missing' ? `Job #${jobId} is not a Pokter job` : 'This job could not be read'}
        action={<LinkButton href="/workspace/jobs" intent="secondary" size="s">All jobs</LinkButton>}
      >
        {state === 'missing'
          ? 'It does not exist on this network, or it was not commissioned through Pokter, so there is no job envelope to read.'
          : 'The chain RPC did not answer. Nothing about the job has changed; try again in a moment.'}
      </EmptyState>
    );
  }
  const owned = Boolean(address && (local || (remote?.client && remote.client.toLowerCase() === address.toLowerCase())));
  return <JobDetail key={job.id} job={job} owned={owned} connected={Boolean(address)} />;
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const ms = Date.parse(to) - now;
  return <>{ms <= 0 ? 'passed' : formatElapsed(ms)}</>;
}

function JobDetail({ job: initial, owned, connected }: { job: HiredJob; owned: boolean; connected: boolean }) {
  const a = useJobActions(initial);
  const job = a.job;
  const phase = jobPhase(job);
  const meta = PHASE[phase];
  const timeline = jobTimeline(job);

  return (
    <div className="flex flex-col gap-8">
      <Breadcrumbs items={[{ href: '/workspace/jobs', label: 'Jobs' }, { label: `#${job.jobId}` }]} />

      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <AgentAvatar name={job.agentName} seed={`${job.agentChainId}:${job.agentTokenId}`} size={52} />
          <div className="flex flex-col gap-1.5">
            <h1 className="t-h2">{job.agentName}</h1>
            <p className="text-[13px] text-ink-3">
              Job <span className="t-readout">#{job.jobId}</span> · {chainLabel(job.chainId)} · hired {new Date(job.hiredAt).toLocaleString()}
            </p>
            <PhaseLabel job={job} className="text-sm" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button intent="secondary" size="s" onClick={() => void a.act('refresh')} busy={a.busy === 'refresh'} icon={<Icon.Refresh size={14} />}>
            Refresh from chain
          </Button>
        </div>
      </header>

      {!owned && (
        <Notice tone="neutral" title={connected ? 'This job was funded by a different wallet' : 'Read-only'}>
          You can see its public record. Only the wallet that funded it can release, dispute or reclaim the escrow.
        </Notice>
      )}

      {/* The one thing that matters now */}
      <section aria-labelledby="now-title" className={cn('flex flex-col gap-4 rounded-[16px] border p-5 sm:p-6', meta.needsYou ? 'border-ink bg-raised shadow-lift' : 'border-rule bg-raised')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="t-label">{meta.needsYou ? 'Your move' : 'Status'}</span>
            <h2 id="now-title" className="t-h3">{meta.next}</h2>
          </div>
          <div className="text-right">
            <span className="t-label">Escrow</span>
            <p className="t-readout text-xl">{budgetOf(job)}</p>
          </div>
        </div>

        {phase === 'working' && (
          <div className="flex flex-col gap-2 text-sm text-ink-2">
            <p>
              Deadline in <strong className="font-semibold text-ink"><Countdown to={job.expiredAt} /></strong>. Pokter re-reads the job every 30 seconds while this page is open.
            </p>
            {a.quiet && (
              <Notice tone="watch" title="Nothing has been submitted for a while">
                That is a fact about the job, not a diagnosis of the agent. If nothing arrives by the deadline, you can reclaim the full amount here.
              </Notice>
            )}
          </div>
        )}

        {phase === 'review' && (
          <div className="flex flex-col gap-4">
            <ol className="flex flex-col gap-3">
              <li className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-rule bg-paper px-4 py-3">
                <span className="flex items-center gap-3 text-sm">
                  <span className={cn('grid size-6 place-items-center rounded-full text-[11px]', a.receiptVerified ? 'bg-ok text-paper' : 'border border-rule-strong text-ink-3')}>{a.receiptVerified ? <Icon.Check size={13} /> : 1}</span>
                  Check the delivered file matches the hash on chain
                </span>
                <Button size="s" intent={a.receiptVerified ? 'ghost' : 'secondary'} onClick={() => void a.verifyReceipt()} busy={a.busy === 'verify'} disabled={a.receiptVerified}>
                  {a.receiptVerified ? 'Matches' : 'Verify'}
                </Button>
              </li>
              <li className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-rule bg-paper px-4 py-3">
                <span className="flex items-center gap-3 text-sm">
                  <span className={cn('grid size-6 place-items-center rounded-full text-[11px]', a.reviewed ? 'bg-ok text-paper' : 'border border-rule-strong text-ink-3')}>{a.reviewed ? <Icon.Check size={13} /> : 2}</span>
                  Read the delivery
                </span>
                {a.deliverableUrl ? (
                  <a href={a.deliverableUrl} target="_blank" rel="noreferrer noopener nofollow" onClick={() => a.setReviewed(true)} className="inline-flex items-center gap-1.5 text-[13px] font-medium link">
                    Open the file <Icon.ArrowUpRight size={14} />
                  </a>
                ) : (
                  <span className="text-[13px] text-ink-3">No readable link was published</span>
                )}
              </li>
            </ol>
            {owned && (
              <div className="flex flex-col gap-3 border-t border-rule pt-4 sm:flex-row sm:items-start sm:justify-between">
                <Button intent="primary" onClick={() => void a.act('approve')} busy={a.busy === 'approve'} disabled={!a.receiptVerified || !a.reviewed}>
                  Release payment
                </Button>
                <div className="flex flex-col gap-2 sm:items-end">
                  <Checkbox checked={a.disputeConfirmed} onChange={(e) => a.setDisputeConfirmed(e.target.checked)} label="It did not deliver what I asked" />
                  <Button intent="danger" size="s" onClick={() => void a.act('dispute')} busy={a.busy === 'dispute'} disabled={!a.disputeConfirmed}>
                    Open a dispute
                  </Button>
                </div>
              </div>
            )}
            <p className="text-[12.5px] text-ink-3">
              Under the escrow&rsquo;s optimistic policy, if you do nothing before the review window closes, payment is released to the agent. A dispute is decided by the policy&rsquo;s voters.
            </p>
          </div>
        )}

        {phase === 'reclaim' && owned && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-2">The only possible destination is the wallet that funded it: yours.</p>
            <Button intent="primary" onClick={() => void a.act('reclaim')} busy={a.busy === 'reclaim'} className="self-start">
              Reclaim {budgetOf(job)}
            </Button>
          </div>
        )}

        {(phase === 'settled' || phase === 'refunded' || phase === 'disputed') && job.deliverableUrl && a.deliverableUrl && (
          <a href={a.deliverableUrl} target="_blank" rel="noreferrer noopener nofollow" className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium link">
            Open the delivered file <Icon.ArrowUpRight size={14} />
          </a>
        )}

        {a.error && <Notice tone="bad">{a.error}</Notice>}
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="timeline-title" className="flex flex-col gap-4">
          <h2 id="timeline-title" className="t-label">
            Timeline
          </h2>
          <ol className="flex flex-col">
            {timeline.map((step, i) => (
              <li key={step.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-4 pb-6 last:pb-0">
                <span className="relative flex justify-center">
                  <span
                    className={cn(
                      'z-10 mt-0.5 grid size-6 place-items-center rounded-full border',
                      step.state === 'complete' ? 'border-ok bg-ok text-paper' : step.state === 'current' ? 'border-ink bg-raised' : step.state === 'terminal' ? 'border-bad bg-bad-wash text-bad' : 'border-rule-strong bg-raised',
                    )}
                  >
                    {step.state === 'complete' ? <Icon.Check size={13} /> : step.state === 'current' ? <span className="size-2 rounded-full bg-ink pulse" /> : step.state === 'terminal' ? <Icon.Cross size={12} /> : null}
                  </span>
                  {i < timeline.length - 1 && <span className={cn('absolute top-7 h-[calc(100%-4px)] w-px', step.state === 'complete' ? 'bg-ok' : 'bg-rule')} aria-hidden />}
                </span>
                <div className="flex flex-col gap-1">
                  <span className={cn('text-sm font-medium', step.state === 'upcoming' && 'text-ink-3')}>{step.label}</span>
                  <span className="text-[13px] leading-snug text-ink-2">{step.detail}</span>
                  <span className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                    <span className="t-label">{step.source === 'onchain' ? 'On chain' : step.source === 'receipt' ? 'Receipt' : 'Pending'}</span>
                    {step.transactionHash && <TxLink hash={step.transactionHash} />}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5 text-sm">
            <span className="t-label">The job</span>
            <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink-2">{job.task}</p>
            <Details summary="On-chain details">
              <dl className="flex flex-col gap-2 text-[13px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">Status</dt>
                  <dd className="t-readout">{STATUS_NAME[job.status]}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-ink-3">Provider</dt>
                  <dd><Address address={job.provider} /></dd>
                </div>
                {job.providerLabel && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-3">Delivered by</dt>
                    <dd>{job.providerLabel}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">Deadline</dt>
                  <dd>{new Date(job.expiredAt).toLocaleString()}</dd>
                </div>
                {job.hireTxHash && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-3">Funding tx</dt>
                    <dd><a className="t-readout link" href={explorerTxUrl(job.hireTxHash)} target="_blank" rel="noreferrer noopener">{job.hireTxHash.slice(0, 10)}…</a></dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-3">Last read</dt>
                  <dd>{job.statusCheckedAt ? new Date(job.statusCheckedAt).toLocaleTimeString() : '—'}</dd>
                </div>
              </dl>
            </Details>
          </div>
          <Link href={`/agents/${job.agentChainId}/${job.agentTokenId}`} className="flex items-center justify-between rounded-[14px] border border-rule bg-raised p-4 text-sm hover:border-rule-strong">
            View the agent <Icon.Arrow size={15} />
          </Link>
          {(phase === 'working' || phase === 'disputed') && (
            <a href={supportMailto({ subject: 'Help with a Pokter job', jobId: job.jobId })} className="text-[13px] text-ink-3 hover:text-ink">
              Something wrong? Contact support
            </a>
          )}
        </aside>
      </div>

      {job.status === 'COMPLETED' && owned && (
        <section aria-labelledby="review-title" className="flex flex-col gap-4 rounded-[16px] border border-rule bg-raised p-5 sm:p-6">
          <div>
            <h2 id="review-title" className="t-h3">Review this job</h2>
            <p className="text-[13.5px] text-ink-2">Only you can, because only the funding wallet can. It is shown on the agent&rsquo;s page.</p>
          </div>
          <ReviewForm job={job} />
        </section>
      )}
    </div>
  );
}

