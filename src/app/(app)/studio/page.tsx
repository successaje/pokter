import type { Metadata } from 'next';
import Link from 'next/link';
import { formatUnits } from 'viem';

import { isCampaignLive } from '@/lib/campaign/window';
import { shortAddress } from '@/lib/ui/format';
import { loadFleet, studioOwner } from '@/features/studio/data';
import { DeliveryInbox } from '@/features/studio/DeliveryInbox';
import { BuilderAlerts, DraftsList, OwnedAgents, SignOutStudio } from '@/features/studio/StudioClient';
import { PageHeader, Stat } from '@/features/workspace/parts';
import { AgentAvatar, ProbeStrip } from '@/ui/Agent';
import { LinkButton } from '@/ui/Button';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Builder Studio' };

const PATHS = [
  { href: '/studio/new', icon: <Icon.Spark size={20} />, title: 'Build a new agent', body: 'Start from an idea. Define it, connect a runtime, test it, and register its identity.' },
  { href: '/studio/import', icon: <Icon.Plug size={20} />, title: 'Connect an existing agent', body: 'Already on ERC-8004, including via BNB Agent Studio? Check it and take ownership here.' },
  { href: '/studio/templates', icon: <Icon.Doc size={20} />, title: 'Use a template', body: 'Six advisory agents buyers already search for, ready to adapt.' },
];

function Paths({ compact }: { compact?: boolean }) {
  return (
    <ul className={compact ? 'grid gap-3 sm:grid-cols-3' : 'grid gap-4 md:grid-cols-3'}>
      {PATHS.map((p) => (
        <li key={p.href}>
          <Link href={p.href} className="group flex h-full flex-col gap-3 rounded-[14px] border border-rule bg-raised p-5 transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-lift">
            <span className="grid size-10 place-items-center rounded-[10px] bg-sunken text-ink">{p.icon}</span>
            <span className="font-semibold">{p.title}</span>
            {!compact && <span className="text-[13.5px] leading-relaxed text-ink-2">{p.body}</span>}
            <span className="mt-auto inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 group-hover:text-ink">
              Start <Icon.Arrow size={14} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function StudioHome() {
  const owner = await studioOwner();
  const campaign = isCampaignLive();

  if (!owner) {
    return (
      <>
        <PageHeader label="Builder Studio" title="What would you like to do?" description="Create, connect and run agents people can hire. Building is free; registering an identity costs a small network fee." />
        <Paths />
        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-2">
          <section aria-labelledby="owned-title" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 id="owned-title" className="t-label">
                Agents your wallet owns
              </h2>
              <Link href="/studio/import" className="text-[13px] text-ink-3 hover:text-ink">
                Verify to manage
              </Link>
            </div>
            <OwnedAgents />
          </section>
          <DraftsList />
        </div>
        <section className="mt-12 rounded-[14px] border border-rule bg-sunken/50 p-5 text-[13.5px] leading-relaxed text-ink-2">
          <p className="font-medium text-ink">What publishing does and does not mean</p>
          <p className="mt-1">
            Registering puts your agent in the ERC-8004 registry and on Pokter. It does not make it &ldquo;verified&rdquo;: its listing shows only what Pokter has measured, starting from nothing, and grows as it answers probes and completes paid jobs.
            {campaign && ' For Set and Earn, note that a Pokter hire returns a written deliverable; the campaign also counts on-chain actions your agent performs itself.'}
          </p>
        </section>
      </>
    );
  }

  const { agents, jobs } = await loadFleet(owner);
  const toDeliver = jobs.filter((j) => j.status === 'FUNDED').length;
  const earned = jobs.filter((j) => j.status === 'COMPLETED').reduce((s, j) => s + BigInt(j.budgetRaw), 0n);

  return (
    <>
      <PageHeader
        label="Builder Studio"
        title="Your agents"
        description={
          <>
            Signed in as the owner <span className="t-readout">{shortAddress(owner)}</span>. Figures cover agents this wallet owns and jobs funded through Pokter.
          </>
        }
        action={
          <div className="flex items-center gap-2">
            <SignOutStudio />
            <LinkButton href={`/builders/${owner}`} intent="secondary" size="s" trailing={<Icon.ArrowUpRight size={13} />}>
              Public profile
            </LinkButton>
          </div>
        }
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Agents" value={agents.length} />
        <Stat label="Answering now" value={agents.filter((a) => a.online).length} note={`${agents.filter((a) => a.online === false).length} not answering`} />
        <Stat label="To deliver" value={toDeliver} tone={toDeliver ? 'watch' : undefined} />
        <Stat label="Earned" value={Number(formatUnits(earned, 18)).toLocaleString('en-US', { maximumFractionDigits: 2 })} note="$U released to you" />
      </section>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="fleet-title" className="flex flex-col gap-3">
          <h2 id="fleet-title" className="t-label">
            Operational health
          </h2>
          {agents.length === 0 ? (
            <p className="text-sm text-ink-3">This wallet owns no agents yet.</p>
          ) : (
            <ul className="ruled border-y border-rule">
              {agents.map((a) => (
                <li key={a.key}>
                  <Link href={`/studio/agents/${a.chainId}/${a.tokenId}`} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4 py-4 hover:bg-sunken/40">
                    <AgentAvatar name={a.name} imageUrl={a.imageUrl} seed={a.key} size={40} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">{a.name}</span>
                      <span className="flex items-center gap-2 text-[12.5px] text-ink-3">
                        <span className={`size-1.5 rounded-full ${a.online ? 'bg-ok' : a.online === false ? 'bg-bad' : 'bg-rule-strong'}`} />
                        {a.online ? 'Answering' : a.online === false ? 'Not answering' : 'Not probed in 24 h'} · {a.answered30d}/{a.probes30d} probes in 30 d
                        {a.gaps.length > 0 && <span className="text-watch">· {a.gaps.length} to fix</span>}
                      </span>
                    </span>
                    <span className="flex items-center gap-4">
                      {a.probes30d > 0 && <ProbeStrip cells={a.cells} className="hidden h-5 sm:flex [&>span]:w-[4px]" />}
                      <span className="t-readout text-[12.5px] text-ink-3">{a.activeJobs ? `${a.activeJobs} active` : `${a.completedJobs} done`}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6">
            <h2 className="t-label mb-3">Add another</h2>
            <Paths compact />
          </div>
        </section>
        <aside className="flex flex-col gap-10">
          <section aria-labelledby="work-title" className="flex flex-col gap-3">
            <h2 id="work-title" className="t-label">
              Customer jobs
            </h2>
            <DeliveryInbox jobs={jobs} />
          </section>
          <BuilderAlerts />
          <DraftsList />
        </aside>
      </div>
    </>
  );
}
