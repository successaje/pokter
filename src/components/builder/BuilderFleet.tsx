'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { cn } from '@/lib/ui/cn';

export interface BuilderFleetAgent {
  chainId: number;
  tokenId: string;
  name: string;
  imageUrl: string | null;
  online: boolean | null;
  listingGaps: number;
  probes24h: number;
  probes30d: number;
  attestations: number;
  activeJobs: number;
  completedJobs: number;
}

type Filter = 'all' | 'attention' | 'work';

function networkName(chainId: number) {
  return chainId === 56 ? 'BNB Chain' : chainId === 97 ? 'BNB Testnet' : `Chain ${chainId}`;
}

function healthLabel(agent: BuilderFleetAgent) {
  if (agent.online === false) return 'No 24h response';
  if (agent.listingGaps > 0) return `${agent.listingGaps} profile gap${agent.listingGaps === 1 ? '' : 's'}`;
  if (agent.online === true) return 'Responding';
  return 'Awaiting measurement';
}

export function BuilderFleet({ agents }: { agents: BuilderFleetAgent[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const counts = useMemo(() => ({
    attention: agents.filter((agent) => agent.online === false || agent.listingGaps > 0).length,
    work: agents.filter((agent) => agent.activeJobs > 0).length,
  }), [agents]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return agents.filter((agent) => {
      if (filter === 'attention' && agent.online !== false && agent.listingGaps === 0) return false;
      if (filter === 'work' && agent.activeJobs === 0) return false;
      if (!normalized) return true;
      return agent.name.toLowerCase().includes(normalized)
        || agent.tokenId.includes(normalized)
        || `${agent.chainId}:${agent.tokenId}`.includes(normalized);
    });
  }, [agents, filter, query]);

  return (
    <section id="agents" aria-labelledby="fleet-heading" className="scroll-mt-24">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">Agent operations</p><h2 id="fleet-heading" className="mt-2 text-xl font-semibold">Your live fleet</h2><p className="mt-1 text-[12px] text-[color:var(--text-muted)]">Find the agent that needs action without leaving the workspace.</p></div>
        <Link href="/build" className="w-fit text-[11px] font-medium text-[color:var(--brand-strong)]">Add an agent →</Link>
      </div>

      {agents.length > 0 && (
        <div className="mt-5 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-2.5">
          <label className="flex min-h-11 items-center gap-2 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-3">
            <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 fill-none stroke-[color:var(--text-muted)]" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg>
            <span className="sr-only">Search your agents</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or agent ID" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[color:var(--text-faint)]" />
            {query && <button type="button" onClick={() => setQuery('')} className="text-[12px] text-[color:var(--text-muted)] hover:text-[color:var(--text)]">Clear</button>}
          </label>
          <div className="mt-2 flex gap-1 overflow-x-auto" role="group" aria-label="Filter agents">
            {([
              ['all', `All ${agents.length}`],
              ['attention', `Needs attention ${counts.attention}`],
              ['work', `Active work ${counts.work}`],
            ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={cn('shrink-0 rounded-[var(--radius)] px-3 py-2 text-[12px] font-medium transition-colors', filter === value ? 'bg-[color:var(--text)] text-[color:var(--bg)]' : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)]')}>{label}</button>)}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {visible.map((agent) => {
          const needsAttention = agent.online === false || agent.listingGaps > 0;
          return (
            <article key={`${agent.chainId}:${agent.tokenId}`} className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
              <div className="p-4 sm:p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <AgentAvatar name={agent.name} src={agent.imageUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="max-w-full truncate text-sm font-semibold">{agent.name}</h3>{agent.activeJobs > 0 && <span className="rounded-full bg-[color:var(--brand-highlight-soft)] px-2 py-0.5 text-[12px] font-semibold text-[color:var(--brand-strong)]">{agent.activeJobs} active job{agent.activeJobs === 1 ? '' : 's'}</span>}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[color:var(--text-muted)]"><span className="rounded-full border border-[color:var(--border)] px-1.5 py-0.5">{networkName(agent.chainId)}</span><span className="mono">Agent #{agent.tokenId}</span></div>
                  </div>
                  <span className={cn('mt-1 size-2 shrink-0 rounded-full', agent.online === true ? 'bg-[color:var(--positive)]' : agent.online === false ? 'bg-[color:var(--negative)]' : 'bg-[color:var(--neutral)]')} title={healthLabel(agent)} />
                </div>

                <div className={cn('mt-4 flex items-center justify-between gap-3 rounded-[var(--radius)] px-3 py-2.5', needsAttention ? 'bg-[color:var(--caution-dim)]' : 'bg-[color:var(--positive-dim)]')}>
                  <div className="min-w-0"><p className={cn('text-[12px] font-semibold', needsAttention ? 'text-[color:var(--caution)]' : 'text-[color:var(--positive)]')}>{healthLabel(agent)}</p><p className="mt-0.5 text-[12px] text-[color:var(--text-muted)]">{needsAttention ? 'Open management for the exact checks and fixes.' : 'Profile and recent response checks look ready.'}</p></div>
                  <Link href={`/build?chainId=${agent.chainId}&tokenId=${agent.tokenId}`} className="shrink-0 rounded-[var(--radius)] bg-[color:var(--surface)] px-3 py-2 text-[12px] font-semibold shadow-sm">Manage</Link>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-2 gap-y-3 border-t border-[color:var(--border)] pt-4 sm:grid-cols-4">
                  <div><dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">Last 24h</dt><dd className="mt-1 text-[11px] font-medium">{agent.probes24h} probes</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">Last 30d</dt><dd className="mt-1 text-[11px] font-medium">{agent.probes30d} probes</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">Attestations</dt><dd className="mt-1 text-[11px] font-medium">{agent.attestations}</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">Completed jobs</dt><dd className="mt-1 text-[11px] font-medium">{agent.completedJobs}</dd></div>
                </dl>
              </div>
              <div className="flex items-center justify-between border-t border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-4 py-2.5 sm:px-5"><span className="text-[12px] text-[color:var(--text-muted)]">Identity {agent.chainId}:{agent.tokenId}</span><Link href={`/agents/${agent.chainId}/${agent.tokenId}`} className="text-[12px] font-medium text-[color:var(--brand-strong)]">View public page ↗</Link></div>
            </article>
          );
        })}
        {!agents.length && <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] p-8 text-center"><p className="text-[12px] font-medium">No agents are currently owned by this wallet.</p><Link href="/build" className="mt-3 inline-flex rounded-[var(--radius)] bg-[color:var(--brand)] px-4 py-2.5 text-[12px] font-semibold text-[color:var(--brand-ink)]">List your first agent</Link></div>}
        {agents.length > 0 && !visible.length && <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] p-8 text-center"><p className="text-[12px] font-medium">No agents match this view.</p><button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className="mt-2 text-[12px] font-medium text-[color:var(--brand-strong)]">Clear filters</button></div>}
      </div>
    </section>
  );
}
