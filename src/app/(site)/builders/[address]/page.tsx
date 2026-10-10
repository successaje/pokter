import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatUnits, getAddress, isAddress } from 'viem';

import { CATEGORY_BY_ID, classify } from '@/lib/agents/categories';
import { verifiedPublisherByOwner } from '@/lib/builders/store';
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
  return { title: isAddress(address) ? `Operator ${address.slice(0, 6)}…${address.slice(-4)}` : 'Operator' };
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
  const keys = new Set(agents.map((a) => `${a.chain_id}:${a.token_id}`));
  const jobs = getJobStore()
    .all()
    .filter((j) => keys.has(`${j.agentChainId ?? 56}:${j.agentTokenId}`) && j.status !== 'OPEN');
  const completed = jobs.filter((j) => j.status === 'COMPLETED');
  const earned = completed.reduce((s, j) => s + BigInt(j.budgetRaw), 0n);
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
      <dl className="mb-10 grid grid-cols-3 gap-3 sm:max-w-xl">
        {[
          ['Agents', agents.length],
          ['Paid jobs done', completed.length],
          ['Earned via Pokter', `${Number(formatUnits(earned, 18)).toLocaleString('en-US', { maximumFractionDigits: 2 })} $U`],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-[12px] border border-rule bg-raised px-4 py-3">
            <dt className="t-label">{k}</dt>
            <dd className="t-readout mt-1 text-lg">{v}</dd>
          </div>
        ))}
      </dl>
      <ul className="ruled border-y border-rule">
        {agents.map((a) => {
          const key = `${a.chain_id}:${a.token_id}`;
          const cat = classify(a);
          return (
            <li key={key}>
              <Link href={`/agents/${a.chain_id}/${a.token_id}`} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4 py-4 hover:bg-sunken/40">
                <AgentAvatar name={a.name} imageUrl={a.image_url} seed={key} size={40} />
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
