'use client';

import { useState } from 'react';
import { useSwitchChain, useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';

import type { VerifiedReview } from '@/lib/reviews/model';
import { feedbackCall } from '@/lib/reviews/onchain';
import { siteUrl } from '@/lib/site';
import { explorerBaseFor } from '@/lib/network/presentation';
import { wagmiConfig } from '@/lib/wallet/config';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';

type Step = 'idle' | 'switching' | 'signing' | 'confirming' | 'verifying' | 'done';

const STEP_LABEL: Record<Step, string> = {
  idle: 'Publish on chain',
  switching: 'Switching network…',
  signing: 'Approve in your wallet',
  confirming: 'Waiting for confirmation…',
  verifying: 'Checking the transaction…',
  done: 'Published',
};

function errorText(message: string): string {
  if (/reject|denied|cancel/i.test(message)) return 'You declined in the wallet. Nothing was published.';
  if (/self|owner|operator/i.test(message)) return 'The registry refuses ratings from the agent’s owner or operators.';
  if (/insufficient funds|gas/i.test(message)) return 'Your wallet does not have enough BNB on this network for the fee.';
  return message;
}

/**
 * Offer to publish a saved review to the ERC-8004 Reputation Registry.
 *
 * Optional, and one transaction from the buyer's own wallet on the chain
 * where the agent is registered: the registry records who gave feedback, so
 * nobody can do it on the buyer's behalf. Pokter then verifies the
 * transaction before showing the review as on chain.
 */
export function PublishRating({ review }: { review: VerifiedReview }) {
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState<Step>(review.onchainTx ? 'done' : 'idle');
  const [hash, setHash] = useState<string | null>(review.onchainTx ?? null);
  const [error, setError] = useState<string | null>(null);
  const mainnet = review.agentChainId === 56;
  const busy = step !== 'idle' && step !== 'done';

  const publish = async () => {
    setError(null);
    try {
      const call = feedbackCall(review, siteUrl());
      setStep('switching');
      await switchChainAsync({ chainId: call.chainId as 56 | 97 });
      setStep('signing');
      const tx = await writeContractAsync(call as Parameters<typeof writeContractAsync>[0]);
      setHash(tx);
      setStep('confirming');
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: tx, chainId: call.chainId as 56 | 97 });
      if (receipt.status !== 'success') throw new Error('The transaction failed on chain. Nothing was published.');
      setStep('verifying');
      const response = await fetch('/api/reviews/onchain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId: review.chainId, jobId: review.jobId, transactionHash: tx }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Pokter could not verify the transaction.');
      setStep('done');
    } catch (caught) {
      setError(errorText((caught as { shortMessage?: string; message?: string }).shortMessage ?? (caught as Error).message ?? 'Not published.'));
      setStep('idle');
    }
  };

  if (step === 'done' && hash) {
    return (
      <p className="text-[13px] text-ink-2">
        Also published to the ERC-8004 reputation registry.{' '}
        <a href={`${explorerBaseFor(review.agentChainId)}/tx/${hash}`} target="_blank" rel="noreferrer noopener" className="link">
          View the transaction
        </a>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-rule bg-raised p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Publish this rating on chain</p>
        <p className="text-[13px] leading-relaxed text-ink-2">
          Adds your {review.rating}-star rating to this agent&rsquo;s record in the ERC-8004 reputation registry, where other marketplaces and tools can read it, with a link back to this signed review. One transaction from your wallet on{' '}
          {mainnet ? 'BNB Smart Chain mainnet, with a small network fee in BNB' : 'BNB testnet, with a fee in test BNB'}. Once published, the review can no longer be edited.
        </p>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <Button size="s" intent="secondary" className="self-start" onClick={() => void publish()} busy={busy} disabled={busy}>
        {STEP_LABEL[step]}
      </Button>
    </div>
  );
}
