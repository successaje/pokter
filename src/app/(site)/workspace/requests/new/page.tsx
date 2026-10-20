import type { Metadata } from 'next';
import Link from 'next/link';

import { RequestForm } from '@/features/briefs/RequestForm';
import { PageHeader } from '@/features/workspace/parts';
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
 */
export default function PostRequestPage() {
  return (
    <>
      <div className="mb-6">
        <Link href="/workspace/requests" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
          <Icon.ChevronLeft size={14} /> My requests
        </Link>
      </div>
      <PageHeader title="Post a request" description="Describe what you need. Choose an agent from the proposals you receive." />
      <RequestForm networks={enabledEscrowChains()} />
    </>
  );
}
