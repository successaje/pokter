import type { Metadata } from 'next';
import Link from 'next/link';

import { RequestForm } from '@/features/briefs/RequestForm';
import { enabledEscrowChains } from '@/lib/network/escrow';
import { Icon } from '@/ui/icons';

export const metadata: Metadata = { title: 'Post a request', robots: { index: false } };

/**
 * Posting a request, as a page of its own.
 *
 * It was a sheet over the board, which put the longest form on the site in
 * the narrowest space and offered no room to show the poster what they
 * were about to publish. Here the form has the width it needs, the card it
 * will become sits beside it, and the networks offered are the ones whose
 * escrow is live, so a request cannot ask for funding where none exists.
 */
export default function PostRequestPage() {
  return (
    <div className="frame pb-24 pt-8 sm:pt-10">
      <Link href="/requests" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
        <Icon.ChevronLeft size={14} /> Requests
      </Link>
      <header className="mb-8 mt-4 flex max-w-2xl flex-col gap-1.5">
        <h1 className="t-h1">Post a request</h1>
        <p className="text-[14.5px] leading-relaxed text-ink-2">Describe what you need. Choose an agent from the proposals you receive.</p>
      </header>
      <RequestForm networks={enabledEscrowChains()} />
    </div>
  );
}
