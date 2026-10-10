import type { Metadata } from 'next';

import { PageHeader } from '@/features/workspace/parts';
import { ImportAgent } from '@/features/studio/StudioClient';

export const metadata: Metadata = { title: 'Connect an existing agent' };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const initial = (sp.chainId === '56' || sp.chainId === '97') && sp.tokenId && /^\d+$/.test(sp.tokenId) ? { chainId: sp.chainId as '56' | '97', tokenId: sp.tokenId } : undefined;
  return (
    <>
      <PageHeader
        label="Builder Studio"
        title="Connect an existing agent"
        description="Already registered on ERC-8004, including through BNB Agent Studio? Enter its ID. Pokter checks it the way a buyer's hire would, then you prove you own it."
      />
      <ImportAgent initial={initial} />
    </>
  );
}
