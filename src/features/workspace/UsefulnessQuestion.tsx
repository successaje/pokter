'use client';

import { useState } from 'react';
import { useSignMessage } from 'wagmi';

import type { HiredJob } from '@/lib/erc8183/types';
import { CONTACT_MAX, REASON_MAX, feedbackMessage, type JobFeedbackContent, type UsefulAnswer } from '@/lib/feedback/model';
import { useActiveWallet } from '@/lib/wallet/active';
import { useHydrated } from '@/lib/ui/use-hydrated';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Controls';
import { Notice } from '@/ui/Feedback';
import { Checkbox, Input, Textarea } from '@/ui/Field';

const ANSWER_LABEL: Record<UsefulAnswer, string> = { yes: 'Yes', partly: 'Partly', no: 'No' };

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
  const { signMessageAsync } = useSignMessage();
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

  if (prior && !editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-ink-2">
          You answered <span className="font-medium text-ink">{ANSWER_LABEL[prior.answered]}</span>. Thank you: it stays private to Pokter.
        </p>
        <button type="button" onClick={() => setEditing(true)} className="text-[13px] font-medium text-ink-2 hover:text-ink hover:underline">
          Change your answer
        </button>
      </div>
    );
  }

  const send = async () => {
    if (!answered) return;
    if (active.mode !== 'external' || !active.address) {
      setError('This is signed by the wallet that funded the job, so connect that browser wallet. Passkey wallets cannot sign messages yet.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const content: JobFeedbackContent = { answered, reason, followUp, contact };
      const signature = await signMessageAsync({ message: feedbackMessage({ chainId: job.chainId, jobId: job.jobId, content }) });
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

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        size="s"
        label="Did this answer the question you hired it for?"
        value={answered ?? ('' as UsefulAnswer)}
        onChange={setAnswered}
        options={[{ value: 'yes', label: 'Yes' }, { value: 'partly', label: 'Partly' }, { value: 'no', label: 'No' }]}
      />
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
          <div className="flex flex-wrap items-center gap-3">
            <Button size="s" onClick={() => void send()} busy={busy}>
              {busy ? 'Approve the signature' : 'Send privately'}
            </Button>
            <span className="text-[12px] text-ink-3">A signature, not a transaction: no gas. It proves you funded this job. Not shown on the agent&rsquo;s page.</span>
          </div>
        </>
      )}
    </div>
  );
}
