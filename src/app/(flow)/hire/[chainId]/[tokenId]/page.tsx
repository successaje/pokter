import type { Metadata } from 'next';

import { briefFromLink, HireContents } from '@/features/hire/HireContents';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Hire' };

/**
 * The hire flow as its own page: what a shared link, a refresh or "Open as
 * a page" loads. Opened from inside the site it is intercepted and shown
 * over the catalogue instead; both render `HireContents`.
 */
export default async function HirePage({
  params,
  searchParams,
}: {
  params: Promise<{ chainId: string; tokenId: string }>;
  searchParams: Promise<{ escrow?: string; task?: string }>;
}) {
  const [{ chainId, tokenId }, { escrow, task }] = await Promise.all([params, searchParams]);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <HireContents chainId={Number(chainId)} tokenId={tokenId} escrow={escrow} initialTask={briefFromLink(task)} />
    </div>
  );
}
