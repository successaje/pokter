'use client';

import { useState } from 'react';

import { shortAddress, shortHash } from '@/lib/ui/format';

interface TrialReceipt {
  receipt: Record<string, unknown>;
  verifiedSigner: string;
  latencyMs: number;
  endpoint: string;
  observedAt: string;
  disclaimer: string;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** A non-transactional A2A negotiation that proves the agent can respond. */
export function TrialPanel({
  agent,
}: {
  agent: { chainId: number; tokenId: string; name: string };
}) {
  const [task, setTask] = useState(
    'Produce a read-only current strategy assessment. State every assumption and data source; execute no transaction.',
  );
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<TrialReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setState('running');
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/trial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chainId: agent.chainId,
          tokenId: agent.tokenId,
          task,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Trial failed.');
      setResult(body as TrialReceipt);
      setState('done');
    } catch (caught) {
      setError((caught as Error).message);
      setState('error');
    }
  };

  const response = object(result?.receipt.response);
  const terms = object(response?.terms);
  const accepted = response?.accepted === true;
  const negotiationHash = String(result?.receipt.negotiation_hash ?? '');
  const signature = String(result?.receipt.provider_sig ?? '');
  const currency = String(terms?.currency ?? '');

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="text-base font-medium">Try the agent before hiring</h2>
          <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
            Sends a read-only A2A negotiation request. It creates no wallet
            permission, moves no funds and executes no strategy transaction.
          </p>
        </div>
        <span className="rounded-full border border-[color:var(--positive)]/35 bg-[color:var(--positive-dim)] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[color:var(--positive)]">
          No wallet required
        </span>
      </div>

      <label className="flex flex-col gap-2 text-xs text-[color:var(--text-muted)]">
        Trial task
        <textarea
          rows={3}
          maxLength={500}
          value={task}
          disabled={state === 'running'}
          onChange={(event) => setTask(event.target.value)}
          className="rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] p-3 text-[12px] leading-relaxed text-[color:var(--text)]"
        />
      </label>

      <button
        type="button"
        onClick={run}
        disabled={state === 'running' || task.trim().length < 10}
        className="w-fit rounded-[var(--radius)] bg-[color:var(--text)] px-4 py-2 text-[13px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {state === 'running' ? 'Asking over A2A…' : 'Run safe trial'}
      </button>

      {error && (
        <p className="rounded-[var(--radius)] border border-[color:var(--negative)]/30 bg-[color:var(--negative-dim)] p-3 text-[11px] leading-relaxed text-[color:var(--negative)]">
          {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-[color:var(--positive)]/30 bg-[color:var(--positive-dim)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12px] font-medium text-[color:var(--positive)]">
              {accepted ? 'Agent accepted the negotiation' : 'Signed response received'}
            </p>
            <span className="mono text-[10px] text-[color:var(--text-muted)]">
              {result.latencyMs}ms · A2A
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-[color:var(--positive)]">
            EIP-191 signature verified against provider{' '}
            <span className="mono">{shortAddress(result.verifiedSigner)}</span>.
          </p>
          <dl className="grid gap-2 text-[11px] sm:grid-cols-2">
            {terms?.price != null && (
              <div>
                <dt className="text-[color:var(--text-faint)]">Quoted raw price</dt>
                <dd className="mono break-all">{String(terms.price)}</dd>
              </div>
            )}
            {currency.startsWith('0x') && (
              <div>
                <dt className="text-[color:var(--text-faint)]">Currency contract</dt>
                <dd className="mono">{shortAddress(currency)}</dd>
              </div>
            )}
            {negotiationHash.startsWith('0x') && (
              <div>
                <dt className="text-[color:var(--text-faint)]">Negotiation hash</dt>
                <dd className="mono">{shortHash(negotiationHash)}</dd>
              </div>
            )}
            {signature.startsWith('0x') && (
              <div>
                <dt className="text-[color:var(--text-faint)]">Provider signature</dt>
                <dd className="mono">{shortHash(signature)}</dd>
              </div>
            )}
          </dl>
          <p className="text-[10px] leading-relaxed text-[color:var(--text-muted)]">
            {result.disclaimer}
          </p>
        </div>
      )}
    </section>
  );
}
