'use client';

import { useState } from 'react';
import { useSignMessage } from 'wagmi';

import type { HiredJob } from '@/lib/erc8183/types';
import { reviewMessage, type ReviewContent, type ReviewSpeed } from '@/lib/reviews/model';
import { useActiveWallet } from '@/lib/wallet/active';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Controls';
import { Notice } from '@/ui/Feedback';
import { Textarea } from '@/ui/Field';

/**
 * A review only the funding wallet can write, for a completed job. The
 * wallet signs the exact content and job identity (a signature, not a
 * transaction: no gas), and the server checks the signer funded the job.
 */
export function ReviewForm({ job }: { job: HiredJob }) {
  const active = useActiveWallet();
  const { signMessageAsync } = useSignMessage();
  const [rating, setRating] = useState(5);
  const [promised, setPromised] = useState<'yes' | 'no'>('yes');
  const [speed, setSpeed] = useState<ReviewSpeed>('on-time');
  const [again, setAgain] = useState<'yes' | 'no'>('yes');
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'signing' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (job.status !== 'COMPLETED') return null;

  if (state === 'saved') {
    return <Notice tone="ok" title="Review published">It is tied to job #{job.jobId} and signed by the wallet that funded it.</Notice>;
  }

  const submit = async () => {
    if (active.mode !== 'external' || !active.address) {
      setError('Reviews are signed by a browser wallet. Passkey wallets cannot sign arbitrary messages yet, so connect the browser wallet that funded this job.');
      return;
    }
    setState('signing');
    setError(null);
    try {
      const content: ReviewContent = { rating, deliveredAsPromised: promised === 'yes', speed, wouldHireAgain: again === 'yes', comment: comment.trim() };
      const agentChainId = job.agentChainId ?? 56;
      const message = reviewMessage({ chainId: job.chainId, jobId: job.jobId, agentChainId, agentTokenId: job.agentTokenId, content });
      const signature = await signMessageAsync({ message });
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: job.jobId, buyer: active.address, signature, agentChainId, agentTokenId: job.agentTokenId, content }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The review could not be verified.');
      setState('saved');
    } catch (caught) {
      const message = (caught as Error).message || 'The review was not submitted.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing was published.' : message);
      setState('idle');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Overall</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating out of 5">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={rating === v}
              aria-label={`${v} of 5`}
              onClick={() => setRating(v)}
              className={cn('grid size-9 place-items-center rounded-[8px] border text-sm font-semibold transition-colors', v <= rating ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-3 hover:border-ink')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-ink-2">Delivered as promised</span>
          <Segmented size="s" label="Delivered as promised" value={promised} onChange={setPromised} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-ink-2">Timing</span>
          <Segmented size="s" label="Timing" value={speed} onChange={setSpeed} options={[{ value: 'early', label: 'Early' }, { value: 'on-time', label: 'On time' }, { value: 'late', label: 'Late' }]} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-ink-2">Hire again</span>
          <Segmented size="s" label="Hire again" value={again} onChange={setAgain} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="review-comment" className="text-[13px] text-ink-2">
          Comment <span className="text-ink-3">(optional, public)</span>
        </label>
        <Textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} className="min-h-20" />
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} busy={state === 'signing'}>
          {state === 'signing' ? 'Approve in your wallet' : 'Sign and publish'}
        </Button>
        <span className="text-[12.5px] text-ink-3">A signature, not a transaction. No fee.</span>
      </div>
    </div>
  );
}
