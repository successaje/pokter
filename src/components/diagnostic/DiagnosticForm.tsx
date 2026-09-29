'use client';

import { useState } from 'react';

import { cn } from '@/lib/ui/cn';
import type { DiagnosticCheck, DiagnosticReport } from '@/lib/diagnostic/checks';

function Mark({ status }: { status: DiagnosticCheck['status'] }) {
  const shared = 'mt-0.5 size-4 shrink-0 fill-none stroke-current';
  if (status === 'pass') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={cn(shared, 'text-[color:var(--positive)]')} strokeWidth="2.4">
        <path d="m5 13 4 4L19 7" />
      </svg>
    );
  }
  if (status === 'fail') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={cn(shared, 'text-[color:var(--caution)]')} strokeWidth="2.2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5v.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn(shared, 'text-[color:var(--text-faint)]')} strokeWidth="2.2">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12h7" />
    </svg>
  );
}

const STATUS_WORD: Record<DiagnosticCheck['status'], string> = {
  pass: 'Observed',
  fail: 'Not working',
  unknown: 'Not checked',
};

export function DiagnosticForm() {
  const [tokenId, setTokenId] = useState('');
  const [chainId, setChainId] = useState('56');
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const response = await fetch('/api/compatibility', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId: Number(chainId), tokenId: tokenId.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) setError(payload.error ?? 'The diagnostic failed.');
      else setReport(payload as DiagnosticReport);
    } catch {
      setError('The diagnostic could not be reached.');
    } finally {
      setBusy(false);
    }
  };

  const failing = report?.checks.filter((c) => c.status === 'fail') ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Bounded: a token id is six digits and a full-width field invites a
          paragraph. */}
      <form onSubmit={run} className="flex max-w-2xl flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5">
          <span className="text-[11px] font-medium text-[color:var(--text-muted)]">
            ERC-8004 token id
          </span>
          <input
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value)}
            inputMode="numeric"
            placeholder="265375"
            className="mono w-full rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 text-[14px]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-[color:var(--text-muted)]">
            Chain
          </span>
          <select
            value={chainId}
            onChange={(e) => setChainId(e.target.value)}
            className="rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 text-[14px]"
          >
            <option value="56">BNB Chain (56)</option>
            <option value="97">BNB Testnet (97)</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || !tokenId.trim()}
          className="action-primary rounded-[var(--radius)] px-4 py-2.5 text-[13px] font-medium disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Run diagnostic'}
        </button>
      </form>

      {busy && (
        <p className="text-[12px] text-[color:var(--text-muted)]">
          Probing the endpoint and negotiating a read-only quote. This calls the
          agent, so it takes a few seconds.
        </p>
      )}

      {error && (
        <p className="rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] px-3 py-2 text-[12px] text-[color:var(--caution)]">
          {error}
        </p>
      )}

      {report && (
        <section className="flex flex-col gap-4">
          <header className="flex flex-col gap-1 border-b border-[color:var(--border)] pb-3">
            <h2 className="font-[family-name:var(--font-serif)] text-xl">
              {report.name ?? `Token #${report.tokenId}`}
            </h2>
            <p className="text-[11px] text-[color:var(--text-faint)]">
              chain {report.chainId} · token #{report.tokenId} · observed{' '}
              {new Date(report.observedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC
            </p>
          </header>

          {/*
            Stated before the list, because an operator scanning a column of
            ticks wants the count, and because "everything we could check
            passed" is a different claim from "everything passed" when some
            checks could not be run at all.
          */}
          <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
            {failing.length === 0
              ? 'Nothing Pokter checks is failing. Anything marked not checked was impossible to test, not broken.'
              : `${failing.length} of ${report.checks.length} checks ${failing.length === 1 ? 'is' : 'are'} failing. Each one below says what changes if you fix it.`}
          </p>

          <ul className="flex flex-col divide-y divide-[color:var(--border)]">
            {report.checks.map((check) => (
              <li key={check.id} className="flex gap-3 py-3">
                <Mark status={check.status} />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium">
                    {check.label}
                    <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                      {STATUS_WORD[check.status]}
                    </span>
                  </p>
                  <p className="text-[12px] leading-relaxed text-[color:var(--text-secondary)] [overflow-wrap:anywhere]">
                    {check.detail}
                  </p>
                  {check.remedy && (
                    <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                      {check.remedy}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
