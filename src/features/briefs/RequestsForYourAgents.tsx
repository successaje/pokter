'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { matchRequests, type MatchableAgent, type MatchableRequest } from '@/lib/briefs/matching';
import { amountText, requestCategoryLabel, requestUnit } from '@/lib/briefs/model';
import { useActiveWallet } from '@/lib/wallet/active';
import { Icon } from '@/ui/icons';

/**
 * Open requests that fit this wallet's agents, on Building's overview.
 *
 * The same match the header's alerts use, read live rather than from the
 * alert store, so it shows what is open now. It draws nothing when there
 * is nothing to answer: an empty "Requests for you" box is a reminder
 * that the board is quiet, not information.
 */
export function RequestsForYourAgents() {
  const { address } = useActiveWallet();
  const agents = useQuery({
    queryKey: ['request-alert-agents', address],
    enabled: Boolean(address),
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<MatchableAgent[]> => {
      const r = await fetch(`/api/builders/agents?address=${address}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('agents unavailable');
      return ((await r.json()) as { agents: MatchableAgent[] }).agents;
    },
  });
  const requests = useQuery({
    queryKey: ['open-requests'],
    enabled: Boolean(address) && Boolean(agents.data?.some((a) => a.categoryId)),
    staleTime: 60_000,
    queryFn: async (): Promise<MatchableRequest[]> => {
      const r = await fetch('/api/briefs', { cache: 'no-store' });
      if (!r.ok) throw new Error('requests unavailable');
      return ((await r.json()) as { briefs: MatchableRequest[] }).briefs;
    },
  });
  if (!address || !agents.data || !requests.data) return null;
  const matches = matchRequests(requests.data, agents.data, address).sort((a, b) => Date.parse(b.request.postedAt) - Date.parse(a.request.postedAt));
  if (matches.length === 0) return null;

  return (
    <section aria-labelledby="requests-for-you" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="requests-for-you" className="text-[17px] font-semibold tracking-[-0.01em]">
            Requests your agents could answer
          </h2>
          <p className="text-[13px] text-ink-3">Open requests in a category one of your agents is listed under.</p>
        </div>
        <Link href="/requests" className="shrink-0 text-[13px] font-medium text-ink-2 hover:text-ink">
          All requests
        </Link>
      </div>
      <ul className="ruled border-y border-rule">
        {matches.slice(0, 4).map(({ request, agents: fit }) => (
          <li key={request.id}>
            <Link href={`/requests/${request.id}`} className="group flex items-center justify-between gap-4 py-3.5 hover:bg-sunken/40">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[14.5px] font-medium">{request.title}</span>
                <span className="truncate text-[12.5px] text-ink-3">
                  {requestCategoryLabel(request.category)} · {fit[0].name}
                  {fit.length > 1 ? ` and ${fit.length - 1} more` : ''} could answer
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="t-readout text-[14px]">
                  {amountText(request.budgetU)} {requestUnit(request)}
                </span>
                <Icon.Arrow size={14} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
