import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { isCampaignLive } from '@/lib/campaign/window';
import { chainLabel } from '@/lib/network/presentation';
import { loadAgentOps, loadFleet, studioOwner } from '@/features/studio/data';
import { LatencyTrend, ProbeLog, WeeklyJobs } from '@/features/studio/OpsCharts';
import { DeliveryInbox } from '@/features/studio/DeliveryInbox';
import { ProfileEditor } from '@/features/studio/ProfileEditor';
import { ImportAgent, NoSession } from '@/features/studio/StudioClient';
import { AgentAvatar, ProbeStrip } from '@/ui/Agent';
import { LinkButton } from '@/ui/Button';
import { Breadcrumbs } from '@/ui/Controls';
import { Readout } from '@/ui/Data';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Manage agent' };

function Progress({ label, value, target, met, note }: { label: string; value: number; target: number; met: boolean; note?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="t-readout text-[13px]">
          {value}/{target}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
        <div className={`h-full rounded-full ${met ? 'bg-ok' : 'bg-ink'}`} style={{ width: `${Math.min(100, (value / target) * 100)}%` }} />
      </div>
      {note && <span className="text-[12px] text-ink-3">{note}</span>}
    </div>
  );
}

export default async function ManageAgent({ params }: { params: Promise<{ chainId: string; tokenId: string }> }) {
  const { chainId: raw, tokenId } = await params;
  const chainId = Number(raw);
  if ((chainId !== 56 && chainId !== 97) || !/^\d+$/.test(tokenId)) notFound();
  const owner = await studioOwner();
  const crumbs = <Breadcrumbs items={[{ href: '/studio', label: 'Studio' }, { label: `#${tokenId}` }]} className="mb-6" />;

  if (!owner) {
    return (
      <>
        {crumbs}
        <NoSession />
        <div className="mt-10">
          <ImportAgent initial={{ chainId: String(chainId) as '56' | '97', tokenId }} />
        </div>
      </>
    );
  }

  const { agents, jobs } = await loadFleet(owner);
  const agent = agents.find((a) => a.chainId === chainId && a.tokenId === tokenId);
  if (!agent) {
    return (
      <>
        {crumbs}
        <Notice tone="watch" title="This agent is not owned by the wallet you verified" action={<LinkButton href="/studio/import" size="s" intent="secondary">Verify another owner</LinkButton>}>
          Studio manages agents owned by {owner.slice(0, 6)}…{owner.slice(-4)}. If ownership changed recently, the registry index may still be catching up.
        </Notice>
      </>
    );
  }
  const mine = jobs.filter((j) => `${j.agentChainId ?? 56}:${j.agentTokenId}` === agent.key);
  const ad = agent.adoption;
  const ops = loadAgentOps(agent.chainId, agent.tokenId, mine);

  return (
    <>
      {crumbs}
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <AgentAvatar name={agent.name} imageUrl={agent.imageUrl} seed={agent.key} size={56} />
          <div>
            <h1 className="t-h2">{agent.name}</h1>
            <p className="text-[13px] text-ink-3">
              ERC-8004 <span className="t-readout">#{agent.tokenId}</span> · {chainLabel(agent.chainId)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <LinkButton href={`/agents/${agent.chainId}/${agent.tokenId}`} intent="secondary" size="s" trailing={<Icon.ArrowUpRight size={13} />}>
            Public listing
          </LinkButton>
          <LinkButton href={`/studio/import?chainId=${agent.chainId}&tokenId=${agent.tokenId}`} intent="ghost" size="s" icon={<Icon.Refresh size={14} />}>
            Re-run checks
          </LinkButton>
        </div>
      </header>

      {agent.gaps.length > 0 && (
        <Notice tone="watch" className="mb-8" title="What is holding this listing back">
          <ul className="list-disc pl-5">
            {agent.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-10">
          <section aria-labelledby="health-title" className="flex flex-col gap-4">
            <h2 id="health-title" className="t-label">
              Health, last 30 days
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <Readout label="Status" value={agent.online ? 'Answering' : agent.online === false ? 'Down' : 'Unprobed'} muted={agent.online === null} />
              <Readout label="Probes answered" value={`${agent.answered30d}/${agent.probes30d}`} />
              <Readout label="Jobs done" value={agent.completedJobs} />
            </div>
            {agent.probes30d > 0 ? <ProbeStrip cells={agent.cells} className="h-8 [&>span]:flex-1" /> : <p className="text-[13px] text-ink-3">Not probed yet. Pokter enrols endpoints that pass the compatibility check.</p>}
          </section>

          <section aria-labelledby="ops-title" className="flex flex-col gap-5">
            <h2 id="ops-title" className="t-label">
              Operations
            </h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Readout label="Released to you" value={`${ops.money.releasedU.toLocaleString('en-US', { maximumFractionDigits: 2 })} $U`} />
              <Readout label="In escrow now" value={`${ops.money.escrowedU.toLocaleString('en-US', { maximumFractionDigits: 2 })} $U`} />
              <Readout label="Refunded jobs" value={ops.money.refundedJobs} muted={!ops.money.refundedJobs} />
              <Readout label="Disputed jobs" value={ops.money.disputedJobs} muted={!ops.money.disputedJobs} />
            </dl>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <WeeklyJobs weeks={ops.weeks} />
              <LatencyTrend points={ops.latency} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium">Probe log, last 20</span>
              <ProbeLog probes={ops.probes} />
            </div>
          </section>

          <section aria-labelledby="jobs-title" className="flex flex-col gap-3">
            <h2 id="jobs-title" className="t-label">
              Customer jobs
            </h2>
            <DeliveryInbox jobs={mine} />
          </section>

          <section aria-labelledby="edit-title" className="flex flex-col gap-4">
            <div>
              <h2 id="edit-title" className="t-h3">
                Public profile
              </h2>
              <p className="text-[13px] text-ink-3">Stored on chain in the ERC-8004 registry. Changes cost one transaction.</p>
            </div>
            <ProfileEditor chainId={agent.chainId as 56 | 97} tokenId={agent.tokenId} />
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          {ad && (
            <section aria-labelledby="adoption-title" className="flex flex-col gap-4 rounded-[14px] border border-rule bg-raised p-5">
              <div>
                <h2 id="adoption-title" className="t-h3">
                  Adoption
                </h2>
                <p className="text-[12.5px] text-ink-3">{isCampaignLive() ? 'Measured against the Set and Earn build targets.' : 'Read from the escrow contract.'}</p>
              </div>
              <Progress label="Hires by independent wallets" value={ad.independentWallets} target={ad.independentTarget} met={ad.hiresMet} note={ad.selfFunded ? `${ad.selfFunded} self-funded hire${ad.selfFunded === 1 ? '' : 's'} not counted` : undefined} />
              <Progress label="On-chain actions by the agent" value={ad.actions} target={ad.actionsTarget} met={ad.actionsMet} note={ad.actionsBlockedReason ?? undefined} />
              <Progress label="Separate active days" value={ad.activeDays} target={ad.daysTarget} met={ad.daysMet} />
            </section>
          )}
          <section className="flex flex-col gap-3 rounded-[14px] border border-rule p-5 text-[13.5px] leading-relaxed text-ink-2">
            <h2 className="t-h3 text-ink">What strengthens the listing</h2>
            <ul className="flex flex-col gap-2">
              <li className="flex gap-2"><Icon.Check size={15} className="mt-0.5 shrink-0 text-ok" />Keep the endpoint answering every probe.</li>
              <li className="flex gap-2"><Icon.Check size={15} className="mt-0.5 shrink-0 text-ok" />Answer <span className="t-readout">negotiate</span> with a signed price.</li>
              <li className="flex gap-2"><Icon.Check size={15} className="mt-0.5 shrink-0 text-ok" />Deliver funded jobs with a verifiable file.</li>
              <li className="flex gap-2"><Icon.Dash size={15} className="mt-0.5 shrink-0 text-ink-3" />&ldquo;Proven&rdquo; needs independent measurers, not just Pokter.</li>
            </ul>
            <Link href="/methodology" className="link text-[13px]">
              How verdicts are computed
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
