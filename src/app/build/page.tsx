import type { Metadata } from 'next';

import { BuilderStudio } from '@/components/builder/BuilderStudio';
import { isCampaignLive } from '@/lib/campaign/window';

export const metadata: Metadata = {
  title: 'Launch an agent',
  description:
    'Prepare, test, register and list an ERC-8004 agent for discovery on Pokter.',
};

export default async function BuildPage({
  searchParams,
}: {
  searchParams: Promise<{ chainId?: string; tokenId?: string }>;
}) {
  const query = await searchParams;
  const chainId = query.chainId === '97' ? '97' : '56';
  const tokenId = /^\d+$/.test(query.tokenId ?? '') ? query.tokenId! : '';
  /*
   * Read on the server, where the clock is Pokter's rather than the
   * visitor's. The notice was unconditional, so it would have gone on
   * advertising a campaign after it closed.
   */
  return (
    <BuilderStudio
      initialIdentity={tokenId ? { chainId, tokenId } : undefined}
      campaignLive={isCampaignLive()}
    />
  );
}
