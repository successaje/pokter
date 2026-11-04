import type { Metadata } from 'next';
import Link from 'next/link';

import { RequestForm } from '@/features/briefs/RequestForm';
import { PageHeader } from '@/features/workspace/parts';
import { draftFromRequest } from '@/lib/briefs/request-draft';
import { getBriefStore } from '@/lib/briefs/store';
import { enabledEscrowChains } from '@/lib/network/escrow';
import { Icon } from '@/ui/icons';
import { getProfileStore } from '@/lib/profiles/store';
import { getAddress, isAddress } from 'viem';
import { avatarSrc, profilePath } from '@/lib/profiles/model';
import { verifiedOwnedAgents } from '@/lib/profiles/owned-agents';

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
  const targetWallet = typeof sp.builder === 'string' && isAddress(sp.builder) ? getAddress(sp.builder) : null;
  const targetProfile = targetWallet ? getProfileStore().get(targetWallet) : null;
  const hasAgent = targetWallet && targetProfile?.published && targetProfile.showBuilding && (await verifiedOwnedAgents(targetWallet)).length > 0;
  const target = targetWallet && targetProfile?.published && targetProfile.showBuilding && hasAgent
    ? { wallet: targetWallet, name: targetProfile.displayName || `@${targetProfile.handle}`, avatar: avatarSrc(targetProfile.avatar), href: profilePath(targetWallet, targetProfile.handle) }
    : null;
  if (sp.builder !== undefined && !target) {
    return <div className="mx-auto max-w-2xl rounded-[16px] border border-rule bg-raised p-8">
      <h1 className="text-2xl font-semibold">This builder cannot receive a directed request yet</h1>
      <p className="mt-3 text-ink-2">The builder must publish a profile with building enabled before you can address a request to them. Nothing has been posted.</p>
      <Link href={targetWallet ? `/builders/${targetWallet}` : '/discover'} className="mt-5 inline-flex text-sm font-semibold underline">Back to builder</Link>
    </div>;
  }
  return (
    <>
      <div className="mb-6">
        <Link href="/workspace/requests" className="inline-flex items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
          <Icon.ChevronLeft size={14} /> My requests
        </Link>
      </div>
      <PageHeader
        title={target ? `Request work from ${target.name}` : copy ? 'Post a request again' : 'Post a request'}
        description={target ? 'Describe the work for this builder. Only agents owned by this builder can propose. Your signed request will be public.' : copy ? 'The same request with a new date. Check the budget and when proposals close, change anything else that should differ, then sign it as a new request.' : 'Describe what you need. Choose an agent from the proposals you receive.'}
      />
      <RequestForm networks={enabledEscrowChains()} initialTitle={initialTitle} copy={copy} target={target} />
    </>
  );
}
