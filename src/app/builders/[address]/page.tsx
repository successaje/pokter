import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUnits, getAddress, isAddress } from 'viem';

import { verifiedPublisherByOwner } from '@/lib/builders/store';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { getJobStore } from '@/lib/erc8183/store';
import { listAgents } from '@/lib/scan/client';
import type { ScanAgent } from '@/lib/scan/types';
import { explorerBaseFor } from '@/lib/network/presentation';

export const dynamic = 'force-dynamic';

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  return { title: isAddress(address) ? `Publisher ${short(address)}` : 'Publisher' };
}

export default async function BuilderProfile({ params }: { params: Promise<{ address: string }> }) {
  const { address: rawAddress } = await params;
  if (!isAddress(rawAddress)) notFound();
  const address = getAddress(rawAddress);
  const proofs = verifiedPublisherByOwner(address);
  if (!proofs.length) notFound();

  const pages = await Promise.all([
    listAgents({ chainId: 56, ownerAddress: address, limit: 100 }).catch(() => ({ items: [] as ScanAgent[] })),
    listAgents({ chainId: 97, ownerAddress: address, limit: 100 }).catch(() => ({ items: [] as ScanAgent[] })),
  ]);
  const agents = pages.flatMap((page) => page.items);
  /*
   * The explorer for the chain this publisher actually works on.
   *
   * This was hardcoded to mainnet bscscan, which was right while Pokter
   * listed mainnet only. Now that chain 97 is listed a publisher can be
   * testnet-only, and their wallet link would have opened an empty
   * mainnet page — the same fault just fixed on the agent page, in the
   * one other place an address is linked.
   *
   * Mainnet wins when they have agents on both, because that is where
   * anything they have spent real gas on will be.
   */
  const walletExplorerBase = explorerBaseFor(
    agents.some((agent) => agent.chain_id === 56) || agents.length === 0 ? 56 : 97,
  );

  const identityKeys = new Set(agents.map((agent) => `${agent.chain_id}:${agent.token_id}`));
  const jobs = getJobStore().all().filter((job) =>
    identityKeys.has(`${job.agentChainId ?? 56}:${job.agentTokenId}`) && job.status !== 'OPEN',
  );
  const completed = jobs.filter((job) => job.status === 'COMPLETED').length;
  const disputed = jobs.filter((job) => Boolean(job.disputeTxHash) || job.status === 'REJECTED').length;
  const funded = jobs.reduce((total, job) => total + BigInt(job.budgetRaw), 0n);
  const activeSince = agents.map((agent) => agent.created_at).filter(Boolean).sort()[0] ?? proofs.at(-1)?.verifiedAt;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16 pt-6 sm:gap-10 sm:pt-10">
      <header className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand)] text-lg font-semibold text-[color:var(--brand-ink)]">{address.slice(2, 4).toUpperCase()}</div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-[family-name:var(--font-serif)] text-3xl tracking-tight sm:text-4xl">Publisher {short(address)}</h1>
                <span className="rounded-full bg-[color:var(--positive-dim)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--positive)]">Wallet verified</span>
              </div>
              <p className="mono mt-2 break-all text-[11px] text-[color:var(--text-muted)]">{address}</p>
              <p className="mt-3 max-w-xl text-[12px] leading-5 text-[color:var(--text-secondary)]">This wallet proved control through a signed, expiring Pokter challenge. Agent ownership below is read live from ERC-8004.</p>
            </div>
          </div>
          <a href={`${walletExplorerBase}/address/${address}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-[var(--radius)] border border-[color:var(--border-strong)] px-4 py-2.5 text-[12px] font-medium hover:bg-[color:var(--surface-hover)]">View wallet ↗</a>
        </div>
      </header>

      <section aria-label="Publisher activity" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Agents', agents.length], ['Agent jobs', jobs.length], ['Agent completions', completed],
          ['Agent job value', `${Number(formatUnits(funded, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} $U`],
          ['Agent disputes', disputed],
        ].map(([label, value]) => <div key={String(label)} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4"><p className="text-xl font-semibold">{value}</p><p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">{label}</p></div>)}
      </section>

      <section aria-labelledby="publisher-agents">
        <div className="flex items-end justify-between gap-4">
          <div><p className="mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--brand-strong)]">Onchain portfolio</p><h2 id="publisher-agents" className="mt-2 text-xl font-semibold">Agents owned by this publisher</h2></div>
          {activeSince && <p className="text-[10px] text-[color:var(--text-muted)]">Active since {new Date(activeSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>}
        </div>
        {agents.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{agents.map((agent) => (
          <Link key={`${agent.chain_id}:${agent.token_id}`} href={`/agents/${agent.chain_id}/${agent.token_id}`} className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 transition hover:-translate-y-0.5 hover:border-[color:var(--brand)]">
            <div className="flex items-center gap-3"><AgentAvatar name={agent.name} src={agent.image_url} size="sm" /><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{agent.name}</h3><p className="mono mt-1 text-[9px] text-[color:var(--text-muted)]">BNB {agent.is_testnet ? 'Testnet' : 'Chain'} · #{agent.token_id}</p></div></div>
            <p className="mt-4 line-clamp-3 text-[12px] leading-5 text-[color:var(--text-secondary)]">{agent.description || 'No public description.'}</p>
            <div className="mt-4 flex items-center justify-between border-t border-[color:var(--border)] pt-3 text-[10px]"><span className="text-[color:var(--text-muted)]">{agent.total_feedbacks} attestations</span><span className="font-medium text-[color:var(--brand-strong)]">View evidence →</span></div>
          </Link>
        ))}</div> : <div className="mt-5 rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] p-8 text-center text-[12px] text-[color:var(--text-muted)]">No ERC-8004 agents are currently owned by this wallet.</div>}
      </section>

      <p className="text-[12px] leading-5 text-[color:var(--text-muted)]">Job figures follow the ERC-8004 identities currently owned by this wallet and include only chain-verified jobs indexed through Pokter’s immutable job envelope. They are portfolio activity—not a claim that this publisher personally performed or earned every job, and not chain-wide totals.</p>
    </div>
  );
}
