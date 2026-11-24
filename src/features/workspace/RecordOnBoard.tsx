'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWriteContract } from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import type { Address } from 'viem';

import { BOARD_CHAIN_ID, boardReviewCall } from '@/lib/board/contract';
import type { VerifiedReview } from '@/lib/reviews/model';
import { explorerBaseFor } from '@/lib/network/presentation';
import { wagmiConfig } from '@/lib/wallet/config';
import { useLiveSwitchChain } from '@/lib/wallet/use-live-switch-chain';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';

type Step = 'idle' | 'switching' | 'signing' | 'confirming' | 'verifying' | 'done';

const STEP_LABEL: Record<Step, string> = {
  idle: 'Record on PokterBoard',
  switching: 'Switching network…',
  signing: 'Approve in your wallet',
  confirming: 'Waiting for confirmation…',
  verifying: 'Checking the transaction…',
  done: 'Recorded',
};

interface Eligibility {
  available: boolean;
  eligible?: boolean;
  recorded?: boolean;
  board?: Address;
  transactionHash?: string;
}

function errorText(message: string): string {
  if (/reject|denied|cancel/i.test(message)) return 'You declined in the wallet. Nothing was recorded.';
  if (/insufficient funds|gas/i.test(message)) return 'Your wallet does not have enough BNB on BNB Smart Chain for the fee.';
  return message;
}

/**
 * Offer to record a saved review on PokterBoard, for a buyer whose wallet
 * holds an Agent ID.
 *
 * Shown only when the server says the board would accept it: a board is
 * set, the buyer holds an Agent ID, and the buyer's call simulates cleanly.
 * One transaction from the buyer's own wallet, since the board records who
 * reviewed; Pokter then checks the transaction before showing it as
 * recorded.
 */
export function RecordOnBoard({ review }: { review: VerifiedReview }) {
  const { switchChainAsync } = useLiveSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState<Step>(review.boardTx ? 'done' : 'idle');
  const [hash, setHash] = useState<string | null>(review.boardTx ?? null);
  /* Sent but not yet confirmed to Pokter, kept in this browser so a lost receipt never invites a second review. */
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = step !== 'idle' && step !== 'done';
  const sentKey = `pokter:board-tx:${review.chainId}:${review.jobId}`;

  const eligibility = useQuery({
    queryKey: ['review-board', review.chainId, review.jobId],
    enabled: !review.boardTx,
    staleTime: 60_000,
    queryFn: async (): Promise<Eligibility> => {
      const response = await fetch(`/api/reviews/board?chainId=${review.chainId}&jobId=${review.jobId}`);
      return response.ok ? ((await response.json()) as Eligibility) : { available: false };
    },
  });

  useEffect(() => {
    if (review.boardTx) return;
    try {
      const stored = window.localStorage.getItem(sentKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring from browser storage after mount
      if (stored) setSent(stored);
    } catch {
      /* Storage unavailable: nothing to restore. */
    }
  }, [review.boardTx, sentKey]);

  const forget = () => {
    try {
      window.localStorage.removeItem(sentKey);
    } catch {}
    setSent(null);
  };

  /* Confirm a sent transaction and have Pokter record it. Never sends anything. */
  const confirm = async (tx: `0x${string}`) => {
    setStep('confirming');
    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: tx, chainId: BOARD_CHAIN_ID });
    if (receipt.status !== 'success') {
      forget();
      throw new Error('The transaction failed on chain. Nothing was recorded.');
    }
    setStep('verifying');
    const response = await fetch('/api/reviews/onchain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chainId: review.chainId, jobId: review.jobId, transactionHash: tx, target: 'board' }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'Pokter could not verify the transaction.');
    forget();
    setHash(tx);
    setStep('done');
  };

  const fail = (caught: unknown) => {
    setError(errorText((caught as { shortMessage?: string; message?: string }).shortMessage ?? (caught as Error).message ?? 'Not recorded.'));
    setStep('idle');
  };

  const record = async (board: Address) => {
    setError(null);
    const call = boardReviewCall(review, board);
    try {
      setStep('switching');
      await switchChainAsync({ chainId: BOARD_CHAIN_ID });
      setStep('signing');
      const tx = await writeContractAsync(call);
      try {
        window.localStorage.setItem(sentKey, tx);
      } catch {}
      setSent(tx);
      await confirm(tx);
    } catch (caught) {
      fail(caught);
    }
  };

  const recordedTx = hash ?? (eligibility.data?.recorded ? eligibility.data.transactionHash ?? null : null);
  if (recordedTx) {
    return (
      <p className="text-[13px] text-ink-2">
        Recorded on PokterBoard with your Agent ID.{' '}
        <a href={`${explorerBaseFor(BOARD_CHAIN_ID)}/tx/${recordedTx}`} target="_blank" rel="noreferrer noopener" className="link">
          View the transaction
        </a>
      </p>
    );
  }
  const board = eligibility.data?.eligible ? eligibility.data.board : undefined;
  if (!sent && !board) return null;

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-rule bg-raised p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Count it as a verified buyer&rsquo;s rating</p>
        <p className="text-[13px] leading-relaxed text-ink-2">
          Your wallet holds an Agent ID, so your {review.rating}-star rating can be recorded on PokterBoard. The contract checks it against the escrow itself and counts it as one person&rsquo;s rating of this agent; if you review this agent again later, the newer rating replaces it. One transaction on BNB Smart Chain mainnet, with a small network fee in BNB. Once recorded, the review can no longer be edited.
        </p>
      </div>
      {sent ? (
        <>
          <Notice tone="watch" title="Sent, not yet confirmed">
            Your review was sent in{' '}
            <a href={`${explorerBaseFor(BOARD_CHAIN_ID)}/tx/${sent}`} target="_blank" rel="noreferrer noopener" className="link">
              this transaction
            </a>
            , but Pokter could not confirm it yet{error ? `: ${error}` : '.'} Check again rather than recording it a second time.
          </Notice>
          <Button
            size="s"
            intent="secondary"
            className="self-start"
            onClick={() => void confirm(sent as `0x${string}`).catch(fail)}
            busy={busy}
            disabled={busy}
          >
            {busy ? STEP_LABEL[step] : 'Check again'}
          </Button>
        </>
      ) : (
        <>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button size="s" intent="secondary" className="self-start" onClick={() => board && void record(board)} busy={busy} disabled={busy}>
            {STEP_LABEL[step]}
          </Button>
        </>
      )}
    </div>
  );
}
