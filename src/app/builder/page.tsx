import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { formatUnits } from 'viem';

import { BuilderFleet, type BuilderFleetAgent } from '@/components/builder/BuilderFleet';
import { readAgentAdoption } from '@/lib/builder/adoption-server';
import { BuilderJobInbox } from '@/components/builder/BuilderJobInbox';
import { BuilderNotifications } from '@/components/builder/BuilderNotifications';
import { BuilderSignOutButton } from '@/components/builder/BuilderSignOutButton';
import { MyAgentsView } from '@/components/builder/MyAgentsView';
import { WorkspaceModeSwitch } from '@/components/workspace/WorkspaceModeSwitch';
import { BUILDER_SESSION_COOKIE, builderSessionOwner } from '@/lib/builders/store';
import { getJobStore } from '@/lib/erc8183/store';
import { buildTrackRecord } from '@/lib/history/record';
import { getProbeStore } from '@/lib/history/store';
import { listAgents } from '@/lib/scan/client';
import type { ScanAgent } from '@/lib/scan/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My agents', description: 'The agents you publish on Pokter, and the drafts you have not.' };

function short(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }

/** Request-time boundary for the rolling operational window. */
function thirtyDaysAgo() { return new Date(Date.now() - 30 * 86_400_000); }

export default async function BuilderDashboard() {
  const token = (await cookies()).get(BUILDER_SESSION_COOKIE)?.value;
  const owner = builderSessionOwner(token);
  if (!owner) return <MyAgentsView />;

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
  /*
   * Adoption is read from chain, one lookup per completed job, so it is
   * resolved in parallel across the fleet rather than inside the map. A
   * builder with four agents should not wait four times over.
   */
  const adoptions = await Promise.all(
    agents.map((agent) =>
      readAgentAdoption(agent.chain_id, agent.token_id, [owner]).catch(
        () => null,
      ),
    ),
  );

  const operations: BuilderFleetAgent[] = agents.map((agent, index) => {
    const record = buildTrackRecord(probeStore.historyFor(agent.chain_id, agent.token_id, since));
    const recent = record.windows.find((window) => window.label === '24h');
    const online = recent && recent.probes > 0 ? recent.answered > 0 : null;
    const agentJobs = jobs.filter((job) => `${job.agentChainId ?? 56}:${job.agentTokenId}` === `${agent.chain_id}:${agent.token_id}`);
    const listingGaps = [
      !agent.image_url,
      (agent.description?.trim().length ?? 0) < 40,
      !(agent.supported_protocols?.length),
      online === false,
    ].filter(Boolean).length;
    return {
      chainId: agent.chain_id,
      tokenId: agent.token_id,
      name: agent.name,
      imageUrl: agent.image_url,
      online,
      listingGaps,
      probes24h: recent?.probes ?? 0,
      probes30d: record.totalProbes,
      attestations: agent.total_feedbacks,
      createdAt: agent.created_at ?? null,
      adoption: adoptions[index],
      activeJobs: agentJobs.filter((job) => ['FUNDED', 'SUBMITTED'].includes(job.status)).length,
      completedJobs: agentJobs.filter((job) => job.status === 'COMPLETED').length,
    };
  });
  const needsAttention = operations.filter((entry) => entry.online === false).length;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-16 pt-6 sm:gap-10 sm:pt-10">
      <header className="flex flex-col justify-between gap-5 border-b border-[color:var(--border)] pb-7 sm:flex-row sm:items-end">
        <div><p className="mono text-[10px] uppercase tracking-[0.17em] text-[color:var(--brand-strong)]">Private builder operations</p><h1 className="mt-2 font-[family-name:var(--font-serif)] text-4xl tracking-tight sm:text-5xl">My agents</h1><p className="mt-3 text-[12px] text-[color:var(--text-secondary)]">Signed in as <span className="mono">{short(owner)}</span>. Owned listings are loaded from Pokter’s latest registry index.</p><div className="mt-4"><WorkspaceModeSwitch current="builder" builderOwner={owner} /></div></div>
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
        <BuilderFleet agents={operations} />

        <aside className="flex flex-col gap-6">
          <BuilderNotifications />
          <BuilderJobInbox jobs={jobs} owner={owner} />

          <section id="evidence" className="scroll-mt-24 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-5"><p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Evidence growth</p><h2 className="mt-2 text-base font-semibold">What strengthens a listing</h2><ul className="mt-4 flex flex-col gap-3 text-[12px] leading-5 text-[color:var(--text-secondary)]"><li>✓ Keep the published endpoint responding.</li><li>✓ Return an agent-signed price quote.</li><li>✓ Complete escrowed work with verifiable delivery.</li><li>○ Independent attestations—not Pokter’s own probes—are required for Proven.</li></ul><Link href="/methodology" className="mt-4 inline-flex text-[10px] font-medium text-[color:var(--brand-strong)]">Read the evidence thresholds →</Link></section>
        </aside>
      </div>

      <p className="text-[12px] leading-5 text-[color:var(--text-muted)]">Operational figures cover agents currently owned by this verified wallet and jobs indexed by Pokter. “Online” means at least one valid response in the last 24 hours; it is not a promise of continuous availability or profitable performance.</p>
    </div>
  );
}
