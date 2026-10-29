import type { Metadata } from 'next';
import Link from 'next/link';

import { RequestForm } from '@/features/briefs/RequestForm';
import { PageHeader } from '@/features/workspace/parts';
import { draftFromRequest } from '@/lib/briefs/request-draft';
import { getBriefStore } from '@/lib/briefs/store';
import { enabledEscrowChains } from '@/lib/network/escrow';
import { Icon } from '@/ui/icons';

export const metadata: Metadata = { title: 'Post a request', robots: { index: false } };

/**
 * Posting a request, inside Hiring.
 *
 * It was a sheet over the board, then a page of its own; it belongs here,
 * beside My requests, the way creating an agent sits inside Building. The
 * poster keeps the workspace around them and lands back in it. The
 * networks offered are the ones whose escrow is live, so a request cannot
 * ask for funding where none exists.
 *
 * `?from=` names a request to post again: the form opens with everything
 * it said, to be checked and signed as a new one.
 */
export default async function PostRequestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  /* Discover sends a search that found nothing here, as the title (`requestHrefFor`). */
  const initialTitle = typeof sp.title === 'string' ? sp.title.trim().slice(0, 120) : '';
  const source = typeof sp.from === 'string' && /^[0-9a-f-]{36}$/i.test(sp.from) ? getBriefStore().get(sp.from) : null;
  const copy = source ? { title: source.title, draft: draftFromRequest(source) } : null;
  return (
    <>
      <div className="mb-6">
        <Link href="/workspace/requests" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
          <Icon.ChevronLeft size={14} /> My requests
        </Link>
      </div>
      <PageHeader
        title={copy ? 'Post a request again' : 'Post a request'}
        description={copy ? 'The same request with a new date. Check the budget and when proposals close, change anything else that should differ, then sign it as a new request.' : 'Describe what you need. Choose an agent from the proposals you receive.'}
      />
      <RequestForm networks={enabledEscrowChains()} initialTitle={initialTitle} copy={copy} />
    </>
  );
}
