'use client';

import { useState } from 'react';
import { formatUnits } from 'viem';
import { formatQuotedPrice } from '@/lib/erc8183/pricing';

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
  const [open, setOpen] = useState(false);

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

  /*
   * Forced open once there is something to read.
   *
   * The trial is optional, so it collapses — but a result or an error is the
   * answer to a question the reader just asked, and letting the panel stay
   * shut over it would hide the thing they pressed the button for.
   */
  const expanded = open || Boolean(result) || Boolean(error);

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={expanded}
        aria-controls="trial-panel"
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-[color:var(--surface-hover)]"
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-semibold">
            Try the agent before hiring
          </span>
          <span className="min-w-0 truncate text-[11px] text-[color:var(--text-muted)]">
            Read-only. No wallet, no funds, no transaction.
          </span>
        </span>

        <span className="shrink-0 rounded-full border border-[color:var(--positive)]/35 bg-[color:var(--positive-dim)] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[color:var(--positive)]">
          No wallet required
        </span>

        <span
          aria-hidden
          className={`shrink-0 text-[color:var(--text-faint)] transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      <div
        id="trial-panel"
        hidden={!expanded}
        className="flex flex-col gap-4 border-t border-[color:var(--border)] p-5"
      >
        <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
          Sends a read-only A2A negotiation request. It creates no wallet
          permission, moves no funds and executes no strategy transaction.
        </p>

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
        className="action-primary w-fit rounded-[var(--radius)] px-4 py-2 text-[13px]"
      >
        {state === 'running' ? 'Asking over A2A…' : 'Run safe trial'}
      </button>

      {error && (
        <p className="rounded-[var(--radius)] border border-[color:var(--negative)]/30 bg-[color:var(--negative-dim)] p-3 text-[12px] leading-relaxed text-[color:var(--negative)]">
          {error}
        </p>
      )}

      {/*
        Neutral, because nothing was delivered.

        This rendered as a green success panel headed "Agent accepted the
        negotiation", which reads as "it worked" — and what came back is a
        price and a signature. Green belongs to real task output; a quote is
        the agent agreeing to be asked, not an answer to the question.
      */}
      {result && (
        <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg-subtle)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12px] font-medium">
              {accepted
                ? 'It answered and signed a price'
                : 'Signed response received'}
            </p>
            <span className="mono text-[10px] text-[color:var(--text-muted)]">
              {result.latencyMs}ms · A2A
            </span>
          </div>
          <p className="text-[12px] leading-relaxed text-[color:var(--text-secondary)]">
            The signature checks out against the agent&rsquo;s registered
            wallet{' '}
            <span className="mono">{shortAddress(result.verifiedSigner)}</span>,
            so the price is the agent&rsquo;s own. This proves it is reachable
            and what it charges — not that it does the work well.
          </p>
          <dl className="grid gap-2 text-[11px] sm:grid-cols-2">
            {terms?.price != null && (
              <div>
                {/*
                  Shown as money. This printed the raw 18-decimal integer —
                  "50000000000000000" — next to the word price, which is a
                  number no buyer can act on.
                */}
                <dt className="text-[color:var(--text-faint)]">Quoted price</dt>
                <dd className="tabular">
                  {(() => {
                    try {
                      return formatQuotedPrice(
                        Number(formatUnits(BigInt(String(terms.price)), 18)),
                      );
                    } catch {
                      return String(terms.price);
                    }
                  })()}
                </dd>
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
          <p className="text-[12px] leading-relaxed text-[color:var(--text-muted)]">
            {result.disclaimer}
          </p>
        </div>
      )}
      </div>
    </section>
  );
}
