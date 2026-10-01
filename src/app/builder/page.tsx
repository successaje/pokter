import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { formatUnits } from 'viem';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { BuilderJobInbox } from '@/components/builder/BuilderJobInbox';
import { BuilderNotifications } from '@/components/builder/BuilderNotifications';
import { BuilderSignOutButton } from '@/components/builder/BuilderSignOutButton';
import { WorkspaceModeSwitch } from '@/components/workspace/WorkspaceModeSwitch';
import { BUILDER_SESSION_COOKIE, builderSessionOwner } from '@/lib/builders/store';
import { getJobStore } from '@/lib/erc8183/store';
import { buildTrackRecord } from '@/lib/history/record';
import { getProbeStore } from '@/lib/history/store';
import { listAgents } from '@/lib/scan/client';
import type { ScanAgent } from '@/lib/scan/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Builder dashboard', description: 'Private operations for verified Pokter publishers.' };

function short(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }

/** Request-time boundary for the rolling operational window. */
function thirtyDaysAgo() { return new Date(Date.now() - 30 * 86_400_000); }

export default async function BuilderDashboard() {
  const token = (await cookies()).get(BUILDER_SESSION_COOKIE)?.value;
  const owner = builderSessionOwner(token);
  if (!owner) redirect('/build');

  const pages = await Promise.all([
    listAgents({ chainId: 56, ownerAddress: owner, limit: 100 }).catch(() => ({ items: [] as ScanAgent[] })),
    listAgents({ chainId: 97, ownerAddress: owner, limit: 100 }).catch(() => ({ items: [] as ScanAgent[] })),
  ]);
  const agents = pages.flatMap((page) => page.items);
  const keys = new Set(agents.map((agent) => `${agent.chain_id}:${agent.token_id}`));
  const jobs = getJobStore().all().filter((job) => keys.has(`${job.agentChainId ?? 56}:${job.agentTokenId}`));
  const activeJobs = jobs.filter((job) => ['FUNDED', 'SUBMITTED'].includes(job.status));
  const completed = jobs.filter((job) => job.status === 'COMPLETED');
  const completedValue = completed.reduce((sum, job) => sum + BigInt(job.budgetRaw), 0n);
  const since = thirtyDaysAgo();
  const probeStore = getProbeStore();
  const operations = agents.map((agent) => {
    const record = buildTrackRecord(probeStore.historyFor(agent.chain_id, agent.token_id, since));
    const recent = record.windows.find((window) => window.label === '24h');
    const online = recent && recent.probes > 0 ? recent.answered > 0 : null;
    const listingGaps = [
      !agent.image_url,
      (agent.description?.trim().length ?? 0) < 40,
      !(agent.supported_protocols?.length),
      online === false,
    ].filter(Boolean).length;
    return { agent, record, recent, online, listingGaps };
  });
  const needsAttention = operations.filter((entry) => entry.online === false).length;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-16 pt-6 sm:gap-10 sm:pt-10">
      <header className="flex flex-col justify-between gap-5 border-b border-[color:var(--border)] pb-7 sm:flex-row sm:items-end">
        <div><p className="mono text-[10px] uppercase tracking-[0.17em] text-[color:var(--brand-strong)]">Private builder operations</p><h1 className="mt-2 font-[family-name:var(--font-serif)] text-4xl tracking-tight sm:text-5xl">Your agents, in operation.</h1><p className="mt-3 text-[12px] text-[color:var(--text-secondary)]">Signed in as <span className="mono">{short(owner)}</span>. Registry ownership is re-read whenever this dashboard loads.</p><div className="mt-4"><WorkspaceModeSwitch current="builder" builderOwner={owner} /></div></div>
        <div className="flex items-center gap-4"><BuilderSignOutButton /><Link href={`/builders/${owner}`} className="w-fit rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 py-2.5 text-[11px] font-medium hover:bg-[color:var(--surface-hover)]">View public profile ↗</Link></div>
      </header>

      <nav aria-label="Builder workspace" className="-mt-4 flex items-center gap-1 overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-1.5">
        {[
          ['Overview', '#overview'],
          ['Agents', '#agents'],
          ['Jobs', '#jobs'],
          ['Evidence', '#evidence'],
        ].map(([label, href], index) => <a key={href} href={href} className={`shrink-0 rounded-[var(--radius)] px-3 py-2 text-[11px] font-medium transition-colors ${index === 0 ? 'bg-[color:var(--surface-hover)] text-[color:var(--text)]' : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]'}`}>{label}</a>)}
        <Link href="/build" className="ml-auto shrink-0 rounded-[var(--radius)] bg-[color:var(--brand)] px-3 py-2 text-[11px] font-semibold text-[color:var(--brand-ink)]">List agent</Link>
      </nav>

      <section id="overview" aria-label="Builder summary" className="scroll-mt-24 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Agents', agents.length], ['Online now', operations.filter((entry) => entry.online === true).length],
          ['Needs attention', needsAttention], ['Active jobs', activeJobs.length],
          ['Completed value', `${Number(formatUnits(completedValue, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} $U`],
        ].map(([label, value]) => <div key={String(label)} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">{label}</p></div>)}
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <section id="agents" aria-labelledby="fleet-heading" className="scroll-mt-24">
          <div className="flex items-end justify-between"><div><p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Agent health</p><h2 id="fleet-heading" className="mt-2 text-xl font-semibold">Your live fleet</h2></div><Link href="/build" className="text-[11px] font-medium text-[color:var(--brand-strong)]">Add an agent →</Link></div>
          <div className="mt-5 flex flex-col gap-3">{operations.map(({ agent, record, recent, online, listingGaps }) => (
            <article key={`${agent.chain_id}:${agent.token_id}`} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
              <div className="flex items-start gap-3"><AgentAvatar name={agent.name} src={agent.image_url} size="sm" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold">{agent.name}</h3><span className={`size-2 rounded-full ${online === true ? 'bg-[color:var(--positive)]' : online === false ? 'bg-[color:var(--negative)]' : 'bg-[color:var(--neutral)]'}`} /><span className="text-[9px] text-[color:var(--text-muted)]">{online === true ? 'Responding' : online === false ? 'No 24h response' : 'Not measured in 24h'}</span></div><p className="mono mt-1 text-[9px] text-[color:var(--text-muted)]">{agent.chain_id}:{agent.token_id}</p></div><div className="flex shrink-0 flex-col items-end gap-2"><Link href={`/agents/${agent.chain_id}/${agent.token_id}`} className="text-[10px] font-medium text-[color:var(--brand-strong)]">Public page ↗</Link><Link href={`/build?chainId=${agent.chain_id}&tokenId=${agent.token_id}`} className="rounded-[var(--radius)] border border-[color:var(--border-strong)] px-2.5 py-1.5 text-[9px] font-semibold hover:bg-[color:var(--surface-hover)]">Manage & retest</Link></div></div>
              <div className={`mt-3 rounded-[var(--radius)] px-3 py-2 text-[9px] ${listingGaps === 0 ? 'bg-[color:var(--positive-dim)] text-[color:var(--positive)]' : 'bg-[color:var(--caution-dim)] text-[color:var(--caution)]'}`}>{listingGaps === 0 ? 'Public profile and recent response checks look ready.' : `${listingGaps} listing check${listingGaps === 1 ? '' : 's'} need attention. Open management for exact fixes.`}</div>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-[color:var(--border)] pt-3 text-center"><div><dt className="text-[9px] uppercase tracking-wide text-[color:var(--text-muted)]">24h</dt><dd className="mt-1 text-[11px] font-medium">{recent?.probes ?? 0} probes</dd></div><div><dt className="text-[9px] uppercase tracking-wide text-[color:var(--text-muted)]">30d</dt><dd className="mt-1 text-[11px] font-medium">{record.totalProbes} probes</dd></div><div><dt className="text-[9px] uppercase tracking-wide text-[color:var(--text-muted)]">Attestations</dt><dd className="mt-1 text-[11px] font-medium">{agent.total_feedbacks}</dd></div></dl>
            </article>
          ))}{!operations.length && <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] p-8 text-center text-[12px] text-[color:var(--text-muted)]">No agents are currently owned by this wallet.</div>}</div>
        </section>

        <aside className="flex flex-col gap-6">
          <BuilderNotifications />
          <BuilderJobInbox jobs={jobs} owner={owner} />

          <section id="evidence" className="scroll-mt-24 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5"><p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Evidence growth</p><h2 className="mt-2 text-base font-semibold">What strengthens a listing</h2><ul className="mt-4 flex flex-col gap-3 text-[11px] leading-5 text-[color:var(--text-secondary)]"><li>✓ Keep the published endpoint responding.</li><li>✓ Return an agent-signed price quote.</li><li>✓ Complete escrowed work with verifiable delivery.</li><li>○ Independent attestations—not Pokter’s own probes—are required for Proven.</li></ul><Link href="/methodology" className="mt-4 inline-flex text-[10px] font-medium text-[color:var(--brand-strong)]">Read the evidence thresholds →</Link></section>
        </aside>
      </div>

      <p className="text-[10px] leading-5 text-[color:var(--text-muted)]">Operational figures cover agents currently owned by this verified wallet and jobs indexed by Pokter. “Online” means at least one valid response in the last 24 hours; it is not a promise of continuous availability or profitable performance.</p>
    </div>
  );
}
