'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';

import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';

const X402Wallet = dynamic(() => import('./X402Wallet'), {
  ssr: false,
  loading: () => (
    <p className="text-[13px] text-ink-3" role="status">
      Loading…
    </p>
  ),
});

/**
 * Pay per call, as the agent page first shows it: what it is and is not,
 * and one button. The wallet libraries, and the request to the seller, wait
 * for that click, so a page view loads neither.
 */
export function X402Island({ chainId, tokenId, agentName }: { chainId: number; tokenId: string; agentName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <Notice tone="watch" title="Paid per call, without escrow">
        This pays {agentName} directly, the moment it settles. There is no review window and no dispute: Pokter&rsquo;s escrow protections do not apply, and only the seller decides any refund.
      </Notice>
      {open ? (
        <X402Wallet chainId={chainId} tokenId={tokenId} />
      ) : (
        <Button intent="secondary" size="s" className="self-start" onClick={() => setOpen(true)}>
          See what one call costs
        </Button>
      )}
    </div>
  );
}
