'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { briefMessage, type BriefContent } from '@/lib/briefs/model';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { Button } from '@/ui/Button';
import { Field, Input, Textarea } from '@/ui/Field';
import { Notice } from '@/ui/Feedback';
import { Sheet } from '@/ui/Sheet';

/**
 * Post a brief: what you want done, what counts as done, and what does not.
 *
 * The two list fields are the point of the form. A brief with a budget and
 * a paragraph is a wish; one that says what will be accepted and what will
 * be rejected is something a builder can price and a reader can later check
 * a delivery against. Acceptance is required for that reason; fail signals
 * are not, because a poster who has none should not be made to invent them.
 */
export function PostBrief({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { address, canSign, sign } = useActiveSigner();
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [acceptance, setAcceptance] = useState('');
  const [failSignals, setFailSignals] = useState('');
  const [budget, setBudget] = useState('');
  const [deliverDays, setDeliverDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!address || !canSign) {
      setError('Connect the wallet you want this brief signed by.');
      return;
    }
    const lines = (value: string) => value.split('\n').map((l) => l.trim()).filter(Boolean);
    const content: BriefContent = {
      title: title.trim(),
      brief: brief.trim(),
      acceptance: lines(acceptance),
      failSignals: lines(failSignals),
      budgetU: Number(budget),
      chainId: 97,
      deliverDays: Number(deliverDays),
    };
    if (!content.title || !content.brief || content.acceptance.length === 0 || !(content.budgetU > 0)) {
      setError('A title, the brief itself, at least one acceptance criterion and a budget are needed.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const postedAt = new Date().toISOString();
      const signature = await sign(briefMessage({ ...content, poster: address, postedAt }));
      const response = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ poster: address, signature, postedAt, content }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The brief was not posted.');
      onClose();
      router.refresh();
    } catch (caught) {
      const message = (caught as Error).message || 'The brief was not posted.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing was posted.' : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      floating
      title="Post a job"
      description="What you want done, and what you will accept. Signed by your wallet, so the terms cannot be changed after someone bids."
      className="sm:max-w-[min(640px,94vw)]"
    >
      <div className="flex flex-col gap-4">
        <Field label="Title">
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Field service route planner" />}
        </Field>
        <Field label="The brief" hint="What the work is, who it is for, and what you will provide.">
          {(p) => <Textarea {...p} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={4000} className="min-h-28" />}
        </Field>
        <Field label="Acceptance criteria" hint="One per line. What a delivery must do to be accepted.">
          {(p) => <Textarea {...p} value={acceptance} onChange={(e) => setAcceptance(e.target.value)} className="min-h-24" />}
        </Field>
        <Field label="Fail signals" hint="One per line, optional. What would make a delivery wrong rather than merely missing.">
          {(p) => <Textarea {...p} value={failSignals} onChange={(e) => setFailSignals(e.target.value)} className="min-h-20" />}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Budget" hint="In $U, funded through escrow on award.">
            {(p) => <Input {...p} value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="0.50" />}
          </Field>
          <Field label="Deliver within" hint="Days from award.">
            {(p) => <Input {...p} value={deliverDays} onChange={(e) => setDeliverDays(e.target.value)} inputMode="numeric" />}
          </Field>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex items-center justify-between gap-3 border-t border-rule pt-4">
          <span className="text-[12.5px] text-ink-3">A signature, not a transaction. No fee, and nothing is funded here.</span>
          <Button onClick={submit} busy={busy}>
            {busy ? 'Approve in your wallet' : 'Sign and post'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
