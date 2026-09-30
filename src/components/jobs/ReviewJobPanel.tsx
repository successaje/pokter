'use client';

import { useState } from 'react';
import { useSignMessage } from 'wagmi';

import type { HiredJob } from '@/lib/erc8183/types';
import { reviewMessage, type ReviewContent, type ReviewSpeed } from '@/lib/reviews/model';
import { useActiveWallet } from '@/lib/wallet/active';

export function ReviewJobPanel({ job }: { job: HiredJob }) {
  const active = useActiveWallet();
  const { signMessageAsync } = useSignMessage();
  const [rating, setRating] = useState(5);
  const [deliveredAsPromised, setDeliveredAsPromised] = useState(true);
  const [speed, setSpeed] = useState<ReviewSpeed>('on-time');
  const [wouldHireAgain, setWouldHireAgain] = useState(true);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'signing' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (job.status !== 'COMPLETED') return null;

  const submit = async () => {
    if (active.mode !== 'external' || !active.address) {
      setError('Connect the browser wallet that funded this job to sign its review. Passkey review signatures are not supported yet.');
      return;
    }
    setState('signing');
    setError(null);
    try {
      const content: ReviewContent = { rating, deliveredAsPromised, speed, wouldHireAgain, comment: comment.trim() };
      const agentChainId = job.agentChainId ?? 56;
      const message = reviewMessage({ chainId: job.chainId, jobId: job.jobId, agentChainId, agentTokenId: job.agentTokenId, content });
      const signature = await signMessageAsync({ message });
      const response = await fetch('/api/reviews', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: job.jobId, buyer: active.address, signature, agentChainId, agentTokenId: job.agentTokenId, content }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The review could not be verified.');
      setState('saved');
    } catch (caught) {
      setError((caught as Error).message || 'The review was not submitted.');
      setState('idle');
    }
  };

  if (state === 'saved') return (
    <div className="rounded-[var(--radius)] border border-[color:var(--positive)]/35 bg-[color:var(--positive-dim)] p-4 text-[11px] text-[color:var(--positive)]">
      Verified review published. It is linked to this completed job and your buyer signature.
    </div>
  );

  return <details className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)]">
    <summary className="cursor-pointer list-none p-4 text-[12px] font-medium">Review this completed job</summary>
    <div className="flex flex-col gap-4 border-t border-[color:var(--border)] p-4">
      <div>
        <p className="text-[11px] text-[color:var(--text-muted)]">Overall rating</p>
        <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="Overall rating">
          {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" role="radio" aria-checked={rating === value} onClick={() => setRating(value)} className="text-xl" style={{ color: value <= rating ? 'var(--brand)' : 'var(--text-faint)' }}>★</button>)}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-[11px] text-[color:var(--text-muted)]">Outcome<select value={deliveredAsPromised ? 'yes' : 'no'} onChange={(event) => setDeliveredAsPromised(event.target.value === 'yes')} className="mt-1.5 w-full rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg)] p-2.5 text-[12px]"><option value="yes">As promised</option><option value="no">Not as promised</option></select></label>
        <label className="text-[11px] text-[color:var(--text-muted)]">Delivery timing<select value={speed} onChange={(event) => setSpeed(event.target.value as ReviewSpeed)} className="mt-1.5 w-full rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg)] p-2.5 text-[12px]"><option value="early">Early</option><option value="on-time">On time</option><option value="late">Late</option></select></label>
        <label className="text-[11px] text-[color:var(--text-muted)]">Hire again<select value={wouldHireAgain ? 'yes' : 'no'} onChange={(event) => setWouldHireAgain(event.target.value === 'yes')} className="mt-1.5 w-full rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg)] p-2.5 text-[12px]"><option value="yes">Yes</option><option value="no">No</option></select></label>
      </div>
      <label className="text-[11px] text-[color:var(--text-muted)]">Optional comment<textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={500} rows={3} className="mt-1.5 w-full resize-y rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg)] p-3 text-[12px]" /></label>
      <p className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">Your wallet signs the exact rating and job identity. No transaction or gas is required. Pokter verifies that the signer funded this completed ERC-8183 job.</p>
      {error && <p className="text-[11px] text-[color:var(--negative)]">{error}</p>}
      <button type="button" onClick={submit} disabled={state === 'signing'} className="action-primary min-h-10 rounded-[var(--radius)] px-4 text-[12px] font-medium disabled:opacity-60">{state === 'signing' ? 'Approve review in wallet…' : 'Sign and publish verified review'}</button>
    </div>
  </details>;
}
