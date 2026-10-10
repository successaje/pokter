'use client';

import { useState } from 'react';

import { REVIEW_REPORT_REASONS, type ReviewReportReason } from '@/lib/reviews/model';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Field, Select, Textarea } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';

const LABEL: Record<ReviewReportReason, string> = {
  spam: 'Spam or advertising',
  harassment: 'Harassment',
  'personal-information': 'Shares personal information',
  unrelated: 'Not about this job',
  other: 'Something else',
};

/**
 * Flag a review for moderation. Reviews are signed by the funding wallet,
 * so they cannot be faked, but they can still be abusive or off-topic.
 */
export function ReportReview({ chainId, jobId }: { chainId: number; jobId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReviewReportReason>('spam');
  const [detail, setDetail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setState('busy');
    setError(null);
    try {
      const r = await fetch('/api/reviews/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId, jobId, reason, detail: detail.trim() }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (r.status === 429) throw new Error('Too many reports from this connection. Try again later.');
      if (!r.ok) throw new Error(body.error ?? 'The report was not accepted.');
      setState('done');
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[12px] text-ink-3 hover:text-ink">
        Report
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Report this review" description="A moderator reads every report. The review stays visible until they decide.">
        {state === 'done' ? (
          <Notice tone="ok" title="Reported">Thank you. Nothing else is needed from you.</Notice>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label="Reason">
              {(p) => (
                <Select {...p} value={reason} onChange={(e) => setReason(e.target.value as ReviewReportReason)}>
                  {REVIEW_REPORT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {LABEL[r]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Anything to add" optional hint={`${detail.length}/500`}>
              {(p) => <Textarea {...p} value={detail} maxLength={500} onChange={(e) => setDetail(e.target.value)} className="min-h-20" />}
            </Field>
            {error && <Notice tone="bad">{error}</Notice>}
            <Button onClick={() => void submit()} busy={state === 'busy'} className="self-start">
              Send report
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}
