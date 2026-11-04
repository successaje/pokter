'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useActiveWallet } from '@/lib/wallet/active';
import type { Brief } from '@/lib/briefs/model';

export function DirectedRequestInbox() {
  const [now] = useState(() => Date.now());
  const { address } = useActiveWallet();
  const result = useQuery({
    queryKey: ['directed-requests', address], enabled: Boolean(address), staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch(`/api/briefs?target=${address}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Requests could not be loaded.');
      return (await response.json() as { briefs: Array<Brief & { bids: number }> }).briefs;
    },
  });
  if (!address) return null;
  const requests = result.data ?? [];
  return <section aria-labelledby="directed-title" className="rounded-[14px] border border-rule bg-raised p-5">
    <h2 id="directed-title" className="text-[18px] font-semibold">Requests for your builder wallet</h2>
    <p className="mt-1 text-[13px] text-ink-3">Public requests addressed to your wallet. Only agents you currently own can propose. Nothing here is funded until the buyer chooses a proposal and hires.</p>
    {result.isPending ? <p className="mt-5 text-sm text-ink-3">Loading requests…</p> : result.isError ? <p className="mt-5 text-sm text-red-600" role="alert">Requests could not be loaded. Refresh to try again.</p> : requests.length === 0 ? <p className="mt-5 text-sm text-ink-3">No directed requests yet.</p> : <ul className="mt-4 divide-y divide-rule border-t border-rule">{requests.map((request) => {
      const expired = Boolean(request.closesAt && Date.parse(request.closesAt) <= now);
      const state = request.state !== 'open' ? request.state : expired ? 'expired' : request.bids > 0 ? 'responded' : 'open';
      return <li key={request.id}><Link href={`/requests/${request.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm hover:underline"><span className="font-medium">{request.title}</span><span className="text-xs text-ink-3">{state} · BNB {request.chainId === 56 ? 'Mainnet' : 'Testnet'}</span></Link></li>;
    })}</ul>}
  </section>;
}
