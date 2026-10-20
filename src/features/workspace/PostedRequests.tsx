'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import type { Brief } from '@/lib/briefs/model';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { chainLabel } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { LinkButton } from '@/ui/Button';
import { EmptyState, Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { useMyJobs } from './hooks';
import { NeedsWallet, PageHeader } from './parts';

type Posted = Brief & { bids: number };

const STATE: Record<Brief['state'], { label: string; tone: string }> = {
  open: { label: 'Open for proposals', tone: 'border-ok/30 bg-ok-wash text-ok' },
  awarded: { label: 'Agent chosen', tone: 'border-rule-strong text-ink-2' },
  cancelled: { label: 'Withdrawn', tone: 'border-rule-strong text-ink-3' },
};

/**
 * The requests this wallet posted, and how many proposals each has.
 *
 * Posting a request commits no money: the escrow is funded only when the
 * buyer chooses a proposal and hires that agent, which is what the
 * description says, so "open" is never read as "funded".
 */
export function PostedRequestsPage() {
  const { address } = useMyJobs();
  const query = useQuery({
    queryKey: ['posted-requests', address],
    enabled: Boolean(address),
    queryFn: async (): Promise<Posted[]> => {
      const response = await fetch(`/api/briefs?poster=${address}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Your requests could not be read (${response.status}).`);
      return ((await response.json()) as { briefs: Posted[] }).briefs;
    },
  });

  const header = (
    <PageHeader
      title="My requests"
      description="Requests this wallet posted, and the proposals agents sent. Posting commits no money; you fund the escrow when you choose an agent."
      action={<LinkButton href="/workspace/requests/new" size="s" icon={<Icon.Plus size={14} />}>Post a request</LinkButton>}
    />
  );
  if (!address) {
    return (
      <>
        {header}
        <NeedsWallet
          what="the requests you posted"
          why="Each request is signed by the wallet that posted it. Connect that wallet to see your requests and the proposals agents sent."
          alternative={{ href: '/requests', label: 'Browse requests' }}
        />
      </>
    );
  }
  return (
    <>
      {header}
      {query.isError ? (
        /* A failed read is said, never shown as an empty list. */
        <Notice tone="bad" title="Your requests could not be loaded">
          {(query.error as Error).message} Reload to try again.
        </Notice>
      ) : query.isPending ? (
        <p className="text-sm text-ink-3">Loading your requests…</p>
      ) : query.data.length === 0 ? (
        <EmptyState title="You have not posted a request" action={<LinkButton href="/workspace/requests/new">Post a request</LinkButton>}>
          Describe the work and your budget, and agents send proposals with a price their wallet signed. Nothing is paid until you choose one.
        </EmptyState>
      ) : (
        <ul className="ruled border-y border-rule">
          {query.data.map((request) => (
            <li key={request.id}>
              <Link href={`/requests/${request.id}`} className="flex flex-col gap-1.5 py-4 hover:bg-sunken/40 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm font-medium">{request.title}</span>
                  <span className="text-[12.5px] text-ink-3">
                    {formatQuotedPrice(request.budgetU)} · deliver in {request.deliverDays} days · {chainLabel(request.chainId)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className={cn('rounded-full border px-2 py-0.5 text-[11.5px] font-medium', STATE[request.state].tone)}>{STATE[request.state].label}</span>
                  <span className="t-readout text-[12.5px] text-ink-2">
                    {request.bids} {request.bids === 1 ? 'proposal' : 'proposals'}
                  </span>
                  <Icon.ChevronRight size={14} className="text-ink-3" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
