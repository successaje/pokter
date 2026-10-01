import type { Metadata } from 'next';

import { BuilderStudio } from '@/components/builder/BuilderStudio';

export const metadata: Metadata = {
  title: 'Build an agent',
  description:
    'Prepare, verify and list an ERC-8004 agent for discovery on Pokter.',
};

export default async function BuildPage({
  searchParams,
}: {
  searchParams: Promise<{ chainId?: string; tokenId?: string }>;
}) {
  const query = await searchParams;
  const chainId = query.chainId === '97' ? '97' : '56';
  const tokenId = /^\d+$/.test(query.tokenId ?? '') ? query.tokenId! : '';
  return <BuilderStudio initialIdentity={tokenId ? { chainId, tokenId } : undefined} />;
}
