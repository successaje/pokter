'use client';

import { useState } from 'react';

import type { HiredJob } from '@/lib/erc8183/types';
import { CONTACT_MAX, REASON_MAX, feedbackMessage, type JobFeedbackContent, type UsefulAnswer } from '@/lib/feedback/model';
import { useActiveWallet } from '@/lib/wallet/active';
import { signPasskeyMessage } from '@/lib/wallet/passkey-message';
import { usePasskeyWallet } from '@/lib/wallet/PasskeyProvider';
import { useHydrated } from '@/lib/ui/use-hydrated';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Checkbox, Input, Textarea } from '@/ui/Field';
import { Icon } from '@/ui/icons';
import { FeedbackCard } from './FeedbackCard';
import { useLiveSignMessage } from '@/lib/wallet/use-live-sign-message';

const ANSWER_LABEL: Record<UsefulAnswer, string> = { yes: 'Yes, fully', partly: 'Partly', no: 'No' };
const ANSWERS: UsefulAnswer[] = ['yes', 'partly', 'no'];

/*
 * What this browser last answered for a job, so a returning buyer sees it.
 * The server keeps no public copy to read back: the answer is private.
 */
const key = (job: HiredJob) => `pokter:job-feedback:${job.chainId}:${job.jobId}`;
function remembered(job: HiredJob): { answered: UsefulAnswer; updatedAt: string } | null {
  try {
    const raw = window.localStorage.getItem(key(job));
    return raw ? (JSON.parse(raw) as { answered: UsefulAnswer; updatedAt: string }) : null;
  } catch {
    return null;
  }
}

/**
 * "Did this answer the question you hired it for?", asked once the work is
 * in. Private to Pokter, separate from the public review, and never needed
 * for anything: nothing waits on it.
 */
export function UsefulnessQuestion({ job }: { job: HiredJob }) {
  const active = useActiveWallet();
  const { signMessageAsync } = useLiveSignMessage();
  const passkey = usePasskeyWallet();
  const hydrated = useHydrated();
  const [justSaved, setPrior] = useState<{ answered: UsefulAnswer; updatedAt: string } | null>(null);
  // Read after hydration: the server has no record of what this browser answered.
  const prior = justSaved ?? (hydrated ? remembered(job) : null);
  const [editing, setEditing] = useState(false);
  const [answered, setAnswered] = useState<UsefulAnswer | null>(null);
  const [reason, setReason] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const card = (body: React.ReactNode) => (
    <FeedbackCard kind="Private feedback" icon={<Icon.Lock size={13} />} title="Did this answer your question?" lede="Only shared with Pokter. Optional, and nothing waits on it.">
      <div className="flex flex-col gap-4 px-5 pb-5 pt-4">{body}</div>
      <p className="mt-auto flex items-center gap-1.5 border-t border-rule px-5 py-3 text-[12px] text-ink-3">
        <Icon.Info size={13} className="shrink-0" aria-hidden />
        Separate from your public review, and never shown on the agent&rsquo;s page.
      </p>
    </FeedbackCard>
  );

  if (prior && !editing) {
    return card(
      <div className="flex flex-col items-start gap-2">
        <p className="text-[13.5px] text-ink-2">
          You answered <span className="font-medium text-ink">{ANSWER_LABEL[prior.answered]}</span>. Thank you.
        </p>
        <button type="button" onClick={() => setEditing(true)} className="text-[13px] font-medium text-ink-2 hover:text-ink hover:underline">
          Change your answer
        </button>
      </div>,
    );
  }

  const send = async () => {
    if (!answered) return;
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
      setError('Connect the wallet that funded this job \u2014 it signs the answer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const content: JobFeedbackContent = { answered, reason, followUp, contact };
      /*
       * A passkey signs through its own account, not an injected
       * provider: wagmi has no connector for it, so this form could be
       * filled in and never submitted. `signPasskeyMessage` exists
       * because "a passkey cannot sign" turned out to be a misreading of
       * the shape being asked for, and the studio already splits this way.
       */
      const message = feedbackMessage({ chainId: job.chainId, jobId: job.jobId, content });
      const signature =
        active.mode === 'passkey' && passkey.wallet
          ? await signPasskeyMessage(passkey.wallet, message)
          : await signMessageAsync({ message });
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId: job.chainId, jobId: job.jobId, buyer: active.address, signature, content }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; saved?: { answered: UsefulAnswer; updatedAt: string } };
      if (!response.ok || !payload.saved) throw new Error(payload.error ?? 'The answer could not be saved.');
      try {
        window.localStorage.setItem(key(job), JSON.stringify({ answered: payload.saved.answered, updatedAt: payload.saved.updatedAt }));
      } catch {
        /* It is saved on Pokter; this browser just will not remember showing it. */
      }
      setPrior({ answered: payload.saved.answered, updatedAt: payload.saved.updatedAt });
      setEditing(false);
    } catch (caught) {
      const message = (caught as Error).message || 'The answer was not sent.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing was sent.' : message);
    } finally {
      setBusy(false);
    }
  };

  return card(
    <>
      <div role="radiogroup" aria-label="Did this answer the question you hired it for?" className="flex flex-col gap-2">
        {ANSWERS.map((value) => {
          const chosen = answered === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => setAnswered(value)}
              className={cn(
                'flex h-11 items-center justify-between rounded-[10px] border px-4 text-left text-[14px] font-medium transition-colors',
                chosen ? 'border-ink bg-sunken text-ink' : 'border-rule-strong text-ink-2 hover:border-ink hover:text-ink',
              )}
            >
              {ANSWER_LABEL[value]}
              {chosen && <Icon.Check size={15} aria-hidden />}
            </button>
          );
        })}
      </div>
      {answered && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`feedback-reason-${job.jobId}`} className="text-[13px] text-ink-2">
              {answered === 'yes' ? 'What made it useful?' : 'What was missing or wrong?'} <span className="text-ink-3">(optional)</span>
            </label>
            <Textarea id={`feedback-reason-${job.jobId}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON_MAX} className="min-h-20" />
          </div>
          <Checkbox
            checked={followUp}
            onChange={(e) => setFollowUp(e.target.checked)}
            label="I’m open to a short follow-up about this job"
            description="Only if you tick this. The contact you give is used for that conversation, not for notifications or marketing."
          />
          {followUp && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`feedback-contact-${job.jobId}`} className="text-[13px] text-ink-2">How to reach you (email, X or Telegram handle)</label>
              <Input id={`feedback-contact-${job.jobId}`} value={contact} onChange={(e) => setContact(e.target.value)} maxLength={CONTACT_MAX} autoComplete="off" />
            </div>
          )}
          {error && <Notice tone="watch">{error}</Notice>}
          <div className="flex flex-col items-start gap-1.5">
            <Button size="s" onClick={() => void send()} busy={busy}>
              {busy ? 'Approve the signature' : 'Send privately'}
            </Button>
            <span className="text-[12px] text-ink-3">A signature, not a transaction: no gas. It proves you funded this job.</span>
          </div>
        </>
      )}
    </>,
  );
}
