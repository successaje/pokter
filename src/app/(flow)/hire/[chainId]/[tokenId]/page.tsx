import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import type { ChainId } from '@/lib/scan/types';
import { loadProfile } from '@/features/agent/profile';
import { HireFlow } from '@/features/hire/HireFlow';
import { LinkButton } from '@/ui/Button';
import { EmptyState } from '@/ui/Feedback';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Hire' };

export default async function HirePage({ params }: { params: Promise<{ chainId: string; tokenId: string }> }) {
  const { chainId: rawChain, tokenId } = await params;
  const chainId = Number(rawChain);
  if ((chainId !== 56 && chainId !== 97) || !/^\d{1,12}$/.test(tokenId)) notFound();

  const result = await loadProfile(chainId as ChainId, tokenId);
  if (result.state === 'missing') notFound();
  if (result.state === 'unreachable') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20">
        <EmptyState tone="bad" title="This agent cannot be checked right now" action={<LinkButton href={`/hire/${chainId}/${tokenId}`} size="s">Try again</LinkButton>}>
          The registry did not answer, so Pokter cannot confirm who would be paid. No hire is offered without that.
        </EmptyState>
      </div>
    );
  }
  const p = result.profile;
  if (!p.hireable) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20">
        <EmptyState title={`${p.name} cannot be hired through Pokter`} action={<><LinkButton href={`/agents/${chainId}/${tokenId}`} size="s" intent="secondary">Back to the agent</LinkButton><LinkButton href={`/discover${p.category ? `?category=${p.category.id}&hireable=1` : '?hireable=1'}`} size="s">Hireable alternatives</LinkButton></>}>
          No provider wallet that can receive an escrowed job was found for it. Pokter does not take payment for a job nobody can deliver.
        </EmptyState>
      </div>
    );
  }

  return (
    <HireFlow
      agent={{ chainId: p.chainId, tokenId: p.tokenId, name: p.name, category: p.category?.id ?? 'unclassified', wallet: p.agentWallet, imageUrl: p.imageUrl, key: p.key }}
      providers={p.providers}
      signedQuoteU={p.quote && p.quote.current && p.quote.payable !== false ? p.quote.priceU : null}
      suggestedU={p.suggestion?.u ?? null}
      warnings={p.warnings}
      escrow={p.escrow}
    />
  );
}
