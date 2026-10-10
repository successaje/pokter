'use client';

import Link from 'next/link';
import { formatUnits } from 'viem';

import { IS_TESTNET } from '@/lib/network/presentation';
import { useWalletState } from '@/shell/wallet/useWalletState';
import { AgentAvatar } from '@/ui/Agent';
import { LinkButton } from '@/ui/Button';
import { EmptyState } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { jobPhase, PHASE, useInbox, useMyJobs, useNow, useSavedAlerts } from './hooks';
import { JobRow, NeedsWallet, PageHeader, Stat, timeLeft } from './parts';
import { RecoverJob } from './RecoverJob';
import { CampaignProgress } from '@/features/campaign/CampaignProgress';
import { isCampaignLive } from '@/lib/campaign/window';

export function WorkspaceOverview() {
  const { jobs, address } = useMyJobs();
  const w = useWalletState();
  const inbox = useInbox();
  const alerts = useSavedAlerts();
  const now = useNow();

  if (!address) {
    return (
      <>
        <PageHeader title="Workspace" description="Everything you have hired, what it is doing, and what needs you." />
        <NeedsWallet what="your hires" />
      </>
    );
  }

  const phases = jobs.map((job) => ({ job, phase: jobPhase(job, now) }));
  const needsYou = phases.filter((p) => PHASE[p.phase].needsYou);
  const working = phases.filter((p) => p.phase === 'working');
  const recent = phases.filter((p) => p.phase === 'settled' || p.phase === 'refunded' || p.phase === 'disputed').slice(0, 4);
  const held = phases
    .filter((p) => p.phase === 'working' || p.phase === 'review' || p.phase === 'reclaim')
    .reduce((sum, p) => sum + Number(formatUnits(BigInt(p.job.budgetRaw), 18)), 0);
  const agents = Array.from(new Map(jobs.map((j) => [`${j.agentChainId}:${j.agentTokenId}`, j])).values()).slice(0, 6);
  const unread = inbox.filter((n) => !n.readAt).length + alerts.filter((a) => !a.readAt).length;

  return (
    <>
      <PageHeader
        title="Workspace"
        description={jobs.length ? 'What your agents are doing, and anything waiting on you.' : 'Your hires will appear here once you fund one.'}
        action={
          <LinkButton href="/discover" icon={<Icon.Search size={16} />}>
            Hire an agent
          </LinkButton>
        }
      />

      {jobs.length === 0 ? (
        <div className="flex flex-col gap-6">
          <EmptyState
            title="No hires yet"
            action={
              <>
                <LinkButton href="/discover">Find an agent</LinkButton>
                <LinkButton href="/how-it-works" intent="ghost">
                  How hiring works
                </LinkButton>
              </>
            }
          >
            Describe a task on Discover, compare the agents that have been measured doing it, and fund one job. It shows up here with its deadline, its delivery and what to do next.
          </EmptyState>
          <div className="rounded-[14px] border border-rule bg-raised p-5">
            <RecoverJob />
            <p className="mt-2 text-[12.5px] text-ink-3">Hired from another device? Pokter rebuilds the job from chain.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {needsYou.length > 0 && (
            <section aria-labelledby="needs-title" className="flex flex-col gap-3">
              <h2 id="needs-title" className="flex items-center gap-2 text-sm font-semibold text-watch">
                <Icon.Alert size={16} /> Needs you ({needsYou.length})
              </h2>
              <ul className="flex flex-col gap-2">
                {needsYou.map(({ job, phase }) => (
                  <li key={job.id}>
                    <Link href={`/workspace/jobs/${job.jobId}`} className="flex flex-col gap-3 rounded-[14px] border border-[color-mix(in_oklab,var(--watch)_35%,transparent)] bg-watch-wash/50 p-4 transition-colors hover:bg-watch-wash sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex items-center gap-3">
                        <AgentAvatar name={job.agentName} seed={`${job.agentChainId}:${job.agentTokenId}`} size={36} />
                        <span className="flex flex-col">
                          <span className="text-[14.5px] font-semibold">
                            {phase === 'review' ? `${job.agentName} delivered` : `${job.agentName} did not deliver`}
                          </span>
                          <span className="text-[13px] text-ink-2">{PHASE[phase].next}</span>
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium">
                        {phase === 'review' ? 'Review delivery' : 'Reclaim escrow'} <Icon.Arrow size={15} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="In progress" value={working.length} href="/workspace/jobs?filter=active" />
            <Stat label="Awaiting you" value={needsYou.length} tone={needsYou.length ? 'watch' : undefined} href="/workspace/jobs?filter=attention" />
            <Stat label="Settled" value={phases.filter((p) => p.phase === 'settled').length} href="/workspace/jobs?filter=done" />
            <Stat label="In escrow" value={`${held.toLocaleString('en-US', { maximumFractionDigits: 2 })}`} note={`$U${IS_TESTNET ? ' · test' : ''}`} href="/workspace/wallet" />
          </section>

          <section aria-labelledby="active-title">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="active-title" className="t-label">
                In progress
              </h2>
              <Link href="/workspace/jobs" className="text-[13px] text-ink-3 hover:text-ink">
                All jobs
              </Link>
            </div>
            {working.length === 0 ? (
              <p className="rounded-[12px] border border-dashed border-rule-strong px-4 py-5 text-sm text-ink-3">Nothing in progress right now.</p>
            ) : (
              <div className="ruled border-y border-rule">
                {working.map(({ job }) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <section aria-labelledby="recent-title">
              <h2 id="recent-title" className="t-label mb-2">
                Recently finished
              </h2>
              {recent.length === 0 ? (
                <p className="text-sm text-ink-3">No finished jobs yet.</p>
              ) : (
                <div className="ruled border-y border-rule">
                  {recent.map(({ job }) => (
                    <JobRow key={job.id} job={job} />
                  ))}
                </div>
              )}
            </section>
            <section aria-labelledby="agents-title">
              <div className="mb-2 flex items-center justify-between">
                <h2 id="agents-title" className="t-label">
                  Your agents
                </h2>
                <Link href="/workspace/agents" className="text-[13px] text-ink-3 hover:text-ink">
                  All
                </Link>
              </div>
              <ul className="ruled border-y border-rule">
                {agents.map((job) => (
                  <li key={`${job.agentChainId}:${job.agentTokenId}`}>
                    <Link href={`/agents/${job.agentChainId}/${job.agentTokenId}`} className="flex items-center gap-3 py-3 hover:bg-sunken/40">
                      <AgentAvatar name={job.agentName} seed={`${job.agentChainId}:${job.agentTokenId}`} size={30} />
                      <span className="flex-1 truncate text-sm font-medium">{job.agentName}</span>
                      <span className="text-[12px] text-ink-3">{jobPhase(job) === 'working' ? timeLeft(job) : `last hired ${new Date(job.hiredAt).toLocaleDateString()}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="flex flex-col gap-4 rounded-[14px] border border-rule bg-raised p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm">
              <Icon.Inbox size={18} className="text-ink-3" />
              <span>{unread > 0 ? `${unread} unread update${unread === 1 ? '' : 's'}` : 'No unread updates'}</span>
              <Link href="/workspace/inbox" className="link text-ink-2">
                Open inbox
              </Link>
            </div>
            <RecoverJob compact />
          </section>
          {w.mode === 'passkey' && <p className="text-[12.5px] text-ink-3">Signed in with a passkey wallet on this device.</p>}
        </div>
      )}
      {isCampaignLive() && (
        <section id="campaign" aria-labelledby="campaign-title" className="mt-10 flex scroll-mt-24 flex-col gap-3">
          <h2 id="campaign-title" className="t-label">
            Set and Earn progress
          </h2>
          <CampaignProgress />
        </section>
      )}
    </>
  );
}
