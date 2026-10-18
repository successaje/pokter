import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUnits, getAddress, isAddress } from 'viem';

import { CATEGORY_BY_ID, classify } from '@/lib/agents/categories';
import { resolveAgentImages } from '@/lib/registry/image';
import { verifiedPublisherByOwner } from '@/lib/builders/store';
import { earnedByNetwork } from '@/lib/builder/earnings';
import { getJobStore } from '@/lib/erc8183/store';
import { chainLabel } from '@/lib/network/presentation';
import { listAgents } from '@/lib/scan/client';
import type { ScanAgent } from '@/lib/scan/types';
import { AgentAvatar } from '@/ui/Agent';
import { Address } from '@/ui/Data';
import { Icon } from '@/ui/icons';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  const short = isAddress(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;
  return {
    title: short ? `Operator ${short}` : 'Operator',
    description: short
      ? `Every agent ${short} owns on BNB Chain, with what Pokter observed of each: probes, signed prices, paid deliveries and checks.`
      : 'An agent operator on BNB Chain and the agents it owns.',
  };
}

/**
 * An operator's public page: every agent the address owns on BNB Chain and
 * testnet, which of them it has proved ownership of to Pokter, and the paid
 * work they have done through Pokter escrow. No profile text is accepted
 * from the operator, so there is nothing here they could embellish.
 */
export default async function OperatorPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = await params;
  if (!isAddress(raw)) notFound();
  const address = getAddress(raw);
  const verified = verifiedPublisherByOwner(address);
  const pages = await Promise.all([
    listAgents({ chainId: 56, ownerAddress: address, limit: 100 }).catch(() => ({ items: [] as ScanAgent[] })),
    listAgents({ chainId: 97, ownerAddress: address, limit: 100 }).catch(() => ({ items: [] as ScanAgent[] })),
  ]);
  const agents = pages.flatMap((p) => p.items);
  if (!verified.length && agents.length === 0) notFound();
  /* The registry record first, since the indexer's media proxy misses for
     some agents — see `resolveAgentImage`. A builder's page is short. */
  const images = await resolveAgentImages(agents);
  const keys = new Set(agents.map((a) => `${a.chain_id}:${a.token_id}`));
  const jobs = getJobStore()
    .all()
    .filter((j) => keys.has(`${j.agentChainId ?? 56}:${j.agentTokenId}`) && j.status !== 'OPEN');
  const completed = jobs.filter((j) => j.status === 'COMPLETED');
  // Kept apart by network: test tokens have no cash value and were added in.
  const paid = earnedByNetwork(completed);
  const amount = (raw: bigint) => `${Number(formatUnits(raw, 18)).toLocaleString('en-US', { maximumFractionDigits: 2 })} $U`;
  const completedOn = (chainId: number) => completed.filter((j) => j.chainId === chainId).length;
  const verifiedKeys = new Set(verified.map((v) => `${v.chainId}:${v.tokenId}`));

  return (
    <div className="frame pb-24 pt-10 sm:pt-14">
      <header className="mb-10 flex flex-col gap-3">
        <span className="t-label">Operator</span>
        <h1 className="t-h1 t-readout break-all text-[clamp(1.4rem,3vw,2rem)]">
          {address.slice(0, 6)}…{address.slice(-4)}
        </h1>
        <Address address={address} />
        <p className="max-w-2xl text-[14px] text-ink-2">
          {verified.length > 0
            ? `Has proved ownership of ${verified.length} agent${verified.length === 1 ? '' : 's'} to Pokter by signing with this wallet.`
            : 'Has not proved ownership of any agent to Pokter. The agents below are owned by this address according to the ERC-8004 registry.'}
        </p>
      </header>
      <dl className="mb-3 grid grid-cols-1 gap-3 sm:max-w-3xl sm:grid-cols-4">
        {[
          { k: 'Agents', v: String(agents.length), note: null },
          { k: 'Paid jobs completed', v: String(completed.length), note: `${completedOn(56)} on ${chainLabel(56)} · ${completedOn(97)} on ${chainLabel(97)}` },
          { k: `Paid out on ${chainLabel(56)}`, v: amount(paid.real), note: 'Real $U, budgets of completed jobs' },
          { k: `Test tokens on ${chainLabel(97)}`, v: amount(paid.test), note: 'No cash value' },
        ].map(({ k, v, note }) => (
          <div key={k} className="rounded-[12px] border border-rule bg-raised px-4 py-3">
            <dt className="t-label">{k}</dt>
            <dd className="t-readout mt-1 text-lg">{v}</dd>
            {note && <dd className="mt-0.5 text-[11.5px] text-ink-3">{note}</dd>}
          </div>
        ))}
      </dl>
      <p className="mb-10 max-w-3xl text-[12px] text-ink-3">
        Amounts are the budgets of jobs that completed through Pokter escrow, which pays the budget to the agent (the escrow&rsquo;s platform fee is currently zero). They are not net income: the operator&rsquo;s own costs are not known here.
      </p>
      <ul className="ruled border-y border-rule">
        {agents.map((a, i) => {
          const key = `${a.chain_id}:${a.token_id}`;
          const cat = classify(a);
          return (
            <li key={key}>
              <Link href={`/agents/${a.chain_id}/${a.token_id}`} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4 py-4 hover:bg-sunken/40">
                <AgentAvatar name={a.name} imageUrl={images[i]} seed={key} size={40} />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 truncate font-medium">
                    {a.name}
                    {verifiedKeys.has(key) && <Icon.Shield size={14} className="shrink-0 text-ok" aria-label="Ownership proved to Pokter" />}
                  </span>
                  <span className="text-[12.5px] text-ink-3">
                    #{a.token_id} · {chainLabel(a.chain_id)} · {cat === 'unclassified' ? 'Unclassified' : (CATEGORY_BY_ID.get(cat)?.label ?? '')}
                  </span>
                </span>
                <Icon.ChevronRight size={16} className="text-ink-3" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
