'use client';

import { useState } from 'react';
import { REVIEW_REPORT_REASONS, type ReviewReportReason } from '@/lib/reviews/model';

const LABELS: Record<ReviewReportReason, string> = {
  spam: 'Spam or manipulation', harassment: 'Harassment',
  'personal-information': 'Personal information', unrelated: 'Unrelated content', other: 'Other',
};

export function ReportReview({ chainId, jobId }: { chainId: number; jobId: string }) {
  const [reason, setReason] = useState<ReviewReportReason>('spam');
  const [detail, setDetail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setState('sending'); setError(null);
    try {
      const response = await fetch('/api/reviews/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chainId, jobId, reason, detail }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The report could not be sent.');
      setState('sent');
    } catch (caught) { setError((caught as Error).message); setState('idle'); }
  };
  if (state === 'sent') return <span className="text-[10px] text-[color:var(--text-faint)]">Reported for review</span>;
  return <details className="group">
    <summary className="cursor-pointer list-none text-[10px] text-[color:var(--text-faint)] hover:text-[color:var(--text-muted)]">Report review</summary>
    <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-3">
      <select value={reason} onChange={(event) => setReason(event.target.value as ReviewReportReason)} className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg)] p-2 text-[11px]">
        {REVIEW_REPORT_REASONS.map((value) => <option key={value} value={value}>{LABELS[value]}</option>)}
      </select>
      <textarea value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={500} rows={2} placeholder="Optional context" className="resize-y rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg)] p-2 text-[11px]" />
      {error && <p className="text-[10px] text-[color:var(--negative)]">{error}</p>}
      <button type="button" onClick={submit} disabled={state === 'sending'} className="self-start rounded-[var(--radius)] border border-[color:var(--border-strong)] px-3 py-1.5 text-[10px]">{state === 'sending' ? 'Sending…' : 'Send report'}</button>
    </div>
  </details>;
}
