'use client';

import { useEffect, useState } from 'react';
import { useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';

import type { VerifiedReview } from '@/lib/reviews/model';
import { feedbackCall } from '@/lib/reviews/onchain';
import { siteUrl } from '@/lib/site';
import { explorerBaseFor } from '@/lib/network/presentation';
import { wagmiConfig } from '@/lib/wallet/config';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { useLiveSwitchChain } from '@/lib/wallet/use-live-switch-chain';

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
  const { switchChainAsync } = useLiveSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState<Step>(review.onchainTx ? 'done' : 'idle');
  const [hash, setHash] = useState<string | null>(review.onchainTx ?? null);
  /*
   * A transaction that was sent but not yet confirmed to Pokter. Kept in
   * this browser, because a receipt the node would not return used to drop
   * the hash and offer Publish again: a second click would put a second
   * rating on chain for one review.
   */
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mainnet = review.agentChainId === 56;
  const busy = step !== 'idle' && step !== 'done';
  const sentKey = `pokter:review-tx:${review.chainId}:${review.jobId}`;

  useEffect(() => {
    if (review.onchainTx) return;
    try {
      const stored = window.localStorage.getItem(sentKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from browser storage after mount
      if (stored) setSent(stored);
    } catch {
      /* Storage unavailable: nothing to restore. */
    }
  }, [review.onchainTx, sentKey]);

  /* Confirm a sent transaction and have Pokter record it. Never sends anything. */
  const confirm = async (tx: `0x${string}`, chainId: 56 | 97) => {
    setStep('confirming');
    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: tx, chainId });
    if (receipt.status !== 'success') {
      try {
        window.localStorage.removeItem(sentKey);
      } catch {}
      setSent(null);
      throw new Error('The transaction failed on chain. Nothing was published.');
    }
    setStep('verifying');
    const response = await fetch('/api/reviews/onchain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chainId: review.chainId, jobId: review.jobId, transactionHash: tx }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'Pokter could not verify the transaction.');
    try {
      window.localStorage.removeItem(sentKey);
    } catch {}
    setSent(null);
    setHash(tx);
    setStep('done');
  };

  const fail = (caught: unknown) => {
    setError(errorText((caught as { shortMessage?: string; message?: string }).shortMessage ?? (caught as Error).message ?? 'Not published.'));
    setStep('idle');
  };

  const publish = async () => {
    setError(null);
    const call = feedbackCall(review, siteUrl());
    try {
      setStep('switching');
      await switchChainAsync({ chainId: call.chainId as 56 | 97 });
      setStep('signing');
      const tx = await writeContractAsync(call as Parameters<typeof writeContractAsync>[0]);
      try {
        window.localStorage.setItem(sentKey, tx);
      } catch {}
      setSent(tx);
      await confirm(tx, call.chainId as 56 | 97);
    } catch (caught) {
      fail(caught);
    }
  };

  const checkAgain = async () => {
    if (!sent) return;
    setError(null);
    try {
      await confirm(sent as `0x${string}`, review.agentChainId as 56 | 97);
    } catch (caught) {
      fail(caught);
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
      {sent ? (
        <>
          <Notice tone="watch" title="Sent, not yet confirmed">
            Your rating was sent in{' '}
            <a href={`${explorerBaseFor(review.agentChainId)}/tx/${sent}`} target="_blank" rel="noreferrer noopener" className="link">
              this transaction
            </a>
            , but Pokter could not confirm it yet{error ? `: ${error}` : '.'} Check again rather than publishing a second time.
          </Notice>
          <Button size="s" intent="secondary" className="self-start" onClick={() => void checkAgain()} busy={busy} disabled={busy}>
            {busy ? STEP_LABEL[step] : 'Check again'}
          </Button>
        </>
      ) : (
        <>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button size="s" intent="secondary" className="self-start" onClick={() => void publish()} busy={busy} disabled={busy}>
            {STEP_LABEL[step]}
          </Button>
          {/*
            A rating sent before this page kept the hash, whose confirmation
            failed: recorded from its transaction, never sent twice. Pokter
            still checks it is this buyer's giveFeedback call for this review.
          */}
          <details className="text-[12.5px] text-ink-3">
            <summary className="cursor-pointer hover:text-ink">Already sent it? Add the transaction</summary>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const value = String(new FormData(e.currentTarget).get('tx') ?? '').trim();
                if (!/^0x[0-9a-fA-F]{64}$/.test(value)) return setError('That is not a transaction hash.');
                setSent(value);
                setError(null);
              }}
            >
              <input name="tx" placeholder="0x…" spellCheck={false} autoComplete="off" className="t-readout h-9 min-w-0 flex-1 rounded-[9px] border border-rule-strong bg-paper px-3 text-[12.5px] text-ink" />
              <Button size="s" intent="ghost" type="submit">
                Use it
              </Button>
            </form>
          </details>
        </>
      )}
    </div>
  );
}
