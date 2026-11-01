'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { HiredJob } from '@/lib/erc8183/types';
import { reviewMessage, type ReviewContent, type ReviewSpeed, type VerifiedReview } from '@/lib/reviews/model';
import { useActiveWallet } from '@/lib/wallet/active';
import { signPasskeyMessage } from '@/lib/wallet/passkey-message';
import { usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Textarea } from '@/ui/Field';
import { Icon } from '@/ui/icons';
import { Rating } from '@/ui/Rating';
import { FeedbackCard } from './FeedbackCard';
import { PublishRating } from './PublishRating';
import { useLiveSignMessage } from '@/lib/wallet/use-live-sign-message';

const RATING_WORD = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'] as const;
const COMMENT_MAX = 500;

/*
 * Stars to choose with, where `Rating` draws one already given. Hovering
 * previews a value and names it; nothing is chosen until a click.
 */
function StarInput({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <div role="radiogroup" aria-label="Rating out of 5" className="-ml-1.5 flex items-center" onMouseLeave={() => setHover(null)}>
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={value === v}
              aria-label={`${v} of 5, ${RATING_WORD[v]}`}
              onMouseEnter={() => setHover(v)}
              onClick={() => onChange(v)}
              className="grid size-10 place-items-center rounded-[8px] transition-transform duration-100 hover:scale-110"
            >
              {v <= shown ? <Icon.StarFilled size={26} className="text-signal" /> : <Icon.Star size={26} className="text-rule-strong" />}
            </button>
          ))}
        </div>
        <span aria-live="polite" className={cn('text-[13.5px] font-medium', shown ? 'text-ink' : 'text-ink-3')}>
          {shown ? RATING_WORD[shown] : 'Not rated'}
        </span>
      </div>
    </div>
  );
}

/*
 * The answer to one question, as joined buttons with the chosen one filled.
 * The shared `Segmented` marks a choice with a slightly lighter chip on a
 * dark track, which is right for a filter and too faint for an answer the
 * buyer is about to sign: inside a card the chosen "On time" was hard to
 * tell from the rest.
 */
function Choice<T extends string>({ label, value, onChange, options }: { label: string; value: T | null; onChange: (value: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-[9px] border border-rule-strong">
      {options.map((option, i) => {
        const chosen = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={chosen}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-8 min-w-14 px-3.5 text-[13px] font-medium transition-colors',
              i > 0 && 'border-l border-rule-strong',
              chosen ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-sunken hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* One question to a line: what is asked on the left, the answer on the right, wrapping under it on a phone. */
function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <span className="text-[14px] text-ink">{label}</span>
      {children}
    </div>
  );
}

/**
 * A review only the funding wallet can write, for a completed job. The
 * wallet signs the exact content and job identity (a signature, not a
 * transaction: no gas), and the server checks the signer funded the job.
 */
export function ReviewForm({ job }: { job: HiredJob }) {
  const active = useActiveWallet();
  const { signMessageAsync } = useLiveSignMessage();
  const passkey = usePasskeyWallet();
  /*
   * Nothing chosen to start with. The form opened at five stars, delivered,
   * on time and would hire again, so a buyer who signed without touching it
   * published the best possible review of work they had not judged.
   */
  const [rating, setRating] = useState<number | null>(null);
  const [promised, setPromised] = useState<'yes' | 'no' | null>(null);
  const [speed, setSpeed] = useState<ReviewSpeed | null>(null);
  const [again, setAgain] = useState<'yes' | 'no' | null>(null);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'signing' | 'saved'>('idle');
  const [saved, setSaved] = useState<VerifiedReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A review this job already has, so a returning buyer sees it (and can
  // publish it on chain) instead of an empty form.
  const agentChainId = job.agentChainId ?? 56;
  const existing = useQuery({
    queryKey: ['job-review', job.chainId, job.jobId],
    enabled: job.status === 'COMPLETED',
    staleTime: 60_000,
    queryFn: async (): Promise<VerifiedReview | null> => {
      const response = await fetch(`/api/reviews?agentChainId=${agentChainId}&agentTokenId=${job.agentTokenId}`);
      if (!response.ok) return null;
      const { reviews } = (await response.json()) as { reviews?: VerifiedReview[] };
      return reviews?.find((r) => r.chainId === job.chainId && r.jobId === job.jobId) ?? null;
    },
  });

  if (job.status !== 'COMPLETED') return null;

  const prior = state === 'saved' ? saved : existing.data;
  if (prior) {
    const mine = active.address?.toLowerCase() === prior.buyer.toLowerCase();
    return (
      <FeedbackCard kind="Public review" icon={<Icon.Globe size={13} />} title={state === 'saved' ? 'Review published' : 'Your review'} lede={<>Shown on the agent&rsquo;s page, signed by the wallet that funded job #{job.jobId}.</>}>
        <div className="flex flex-col gap-3 px-5 py-4">
          <Rating value={prior.rating} />
          {prior.comment && <p className="text-[14px] leading-relaxed text-ink-2">&ldquo;{prior.comment}&rdquo;</p>}
          {(state === 'saved' || (mine && active.mode === 'external')) && <PublishRating review={prior} />}
        </div>
      </FeedbackCard>
    );
  }

  const submit = async () => {
    /*
     * A passkey counts. This refused one and said "passkey wallets
     * cannot sign messages yet", which was never true of the wallet —
     * only of the shape that was being asked for, as
     * `signPasskeyMessage` records. It rejected after the form was
     * filled in, and sent somebody to connect a different browser
     * wallet, which could not own this job anyway.
     */
    const signer = active.address && (active.mode === 'external' || (active.mode === 'passkey' && passkey.wallet));
    if (!signer) {
      setError('Connect the wallet that funded this job \u2014 it signs the review.');
      return;
    }
    if (rating === null || promised === null || speed === null || again === null) return;
    setState('signing');
    setError(null);
    try {
      const content: ReviewContent = { rating, deliveredAsPromised: promised === 'yes', speed, wouldHireAgain: again === 'yes', comment: comment.trim() };
      const agentChainId = job.agentChainId ?? 56;
      const message = reviewMessage({ chainId: job.chainId, jobId: job.jobId, agentChainId, agentTokenId: job.agentTokenId, content });
      /*
       * A passkey signs through its own account, not an injected
       * provider: wagmi has no connector for it, so this form could be
       * filled in and never submitted. `signPasskeyMessage` exists
       * because "a passkey cannot sign" turned out to be a misreading of
       * the shape being asked for, and the studio already splits this way.
       */
      const signature =
        active.mode === 'passkey' && passkey.wallet
          ? await signPasskeyMessage(passkey.wallet, message)
          : await signMessageAsync({ message });
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId: job.chainId, jobId: job.jobId, buyer: active.address, signature, agentChainId, agentTokenId: job.agentTokenId, content }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; review?: VerifiedReview };
      if (!response.ok) throw new Error(payload.error ?? 'The review could not be verified.');
      setSaved(payload.review ?? null);
      setState('saved');
    } catch (caught) {
      const message = (caught as Error).message || 'The review was not submitted.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing was published.' : message);
      setState('idle');
    }
  };

  const missing = rating === null ? 'Choose a rating to continue.' : promised === null || speed === null || again === null ? 'Answer the three questions to continue.' : null;
  return (
    <FeedbackCard kind="Public review" icon={<Icon.Globe size={13} />} title="Review this job" lede={<>Published on the agent&rsquo;s page. Only the wallet that funded the job can sign it.</>}>
      <div className="mt-4 divide-y divide-rule border-t border-rule px-5">
        <div className="flex flex-col gap-1 py-3">
          <span className="text-[14px] text-ink">Your rating</span>
          <StarInput value={rating} onChange={setRating} />
        </div>
        <Question label="Delivered as promised?">
          <Choice label="Delivered as promised" value={promised} onChange={setPromised} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        </Question>
        <Question label="Delivery timing">
          <Choice label="Delivery timing" value={speed} onChange={setSpeed} options={[{ value: 'early', label: 'Early' }, { value: 'on-time', label: 'On time' }, { value: 'late', label: 'Late' }]} />
        </Question>
        <Question label="Would you hire it again?">
          <Choice label="Would you hire it again" value={again} onChange={setAgain} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
        </Question>
        <div className="flex flex-col gap-2 py-3">
          <label htmlFor="review-comment" className="flex items-baseline justify-between gap-2 text-[14px] text-ink">
            <span>
              Public comment <span className="text-[12.5px] text-ink-3">Optional</span>
            </span>
            <span className="t-readout text-[11.5px] text-ink-3">{comment.length}/{COMMENT_MAX}</span>
          </label>
          <Textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={COMMENT_MAX} placeholder="What worked well? What could be better?" className="min-h-20" />
        </div>
      </div>
      <footer className="flex flex-col gap-3 border-t border-rule px-5 py-4">
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button onClick={submit} busy={state === 'signing'} disabled={missing !== null} trailing={<Icon.Arrow size={15} />}>
            {state === 'signing' ? 'Approve in your wallet' : 'Sign and publish'}
          </Button>
          <span className="text-[12.5px] text-ink-3">{missing ?? 'A wallet signature, not a transaction. No fee.'}</span>
        </div>
      </footer>
    </FeedbackCard>
  );
}
