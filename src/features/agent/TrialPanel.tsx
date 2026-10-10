'use client';

import { useState } from 'react';
import { formatUnits } from 'viem';

import { formatQuotedPrice } from '@/lib/erc8183/pricing';
import { shortAddress } from '@/lib/ui/format';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Textarea } from '@/ui/Field';
import { Icon } from '@/ui/icons';

interface TrialResult {
  receipt: Record<string, unknown>;
  verifiedSigner: string;
  termsBound?: boolean;
  latencyMs: number;
  endpoint: string;
  observedAt: string;
  disclaimer: string;
}

const STAGES = ['Contacting the agent', 'Sending your task', 'Waiting for a signed answer', 'Checking the signature'];

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

/**
 * Try before paying: the agent is asked whether it would take this task
 * and at what price, and must sign its answer with its registered wallet.
 * No wallet, no payment, and nothing is executed. The stages shown are the
 * request's real phases; the spinner does not pretend to know which one
 * the server is in beyond elapsed time.
 */
export function TrialPanel({ agent, defaultTask }: { agent: { chainId: number; tokenId: string; name: string }; defaultTask: string }) {
  const [task, setTask] = useState(defaultTask);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<TrialResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setState('running');
    setError(null);
    setResult(null);
    setStage(0);
    const ticker = window.setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 2)), 1200);
    try {
      const response = await fetch('/api/trial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId: agent.chainId, tokenId: agent.tokenId, task }),
      });
      setStage(STAGES.length - 1);
      const body = await response.json().catch(() => ({}));
      if (response.status === 429) throw new Error('Too many trials from this connection. Wait a minute and try again.');
      if (!response.ok) throw new Error(body.error ?? 'The agent did not return a signed answer.');
      setResult(body as TrialResult);
      setState('done');
    } catch (caught) {
      setError((caught as Error).message);
      setState('error');
    } finally {
      window.clearInterval(ticker);
    }
  };

  const response = obj(result?.receipt.response);
  const terms = obj(response?.terms);
  const accepted = response?.accepted === true;
  const priceRaw = terms?.price ?? terms?.amount;
  let price: string | null = null;
  try {
    if (typeof priceRaw === 'string' || typeof priceRaw === 'number') price = formatQuotedPrice(Number(formatUnits(BigInt(priceRaw), 18)));
  } catch {
    price = null;
  }
  const reason = typeof response?.reason === 'string' ? response.reason : typeof response?.message === 'string' ? response.message : null;

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor="trial-task" className="text-sm font-medium">
        Your task
      </label>
      <Textarea id="trial-task" value={task} onChange={(e) => setTask(e.target.value)} maxLength={500} className="min-h-24 text-[14px]" />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} busy={state === 'running'} disabled={task.trim().length < 10} intent="secondary" icon={<Icon.Play size={14} />}>
          Ask for a signed answer
        </Button>
        <span className="text-[12.5px] text-ink-3">Free · no wallet · nothing is executed</span>
      </div>

      {state === 'running' && (
        <ol className="flex flex-col gap-1.5 text-[13px]" aria-live="polite">
          {STAGES.map((label, i) => (
            <li key={label} className={i < stage ? 'text-ink-2' : i === stage ? 'font-medium text-ink' : 'text-ink-3'}>
              <span className="mr-2 inline-block w-4 text-center">{i < stage ? '✓' : i === stage ? '·' : ''}</span>
              {label}
            </li>
          ))}
        </ol>
      )}

      {state === 'error' && error && (
        <Notice tone="watch" title="No signed answer came back">
          {error} That is itself evidence: an agent that cannot answer a free question is unlikely to deliver a paid one.
        </Notice>
      )}

      {result && (
        <div className="anim-rise flex flex-col gap-3 rounded-[12px] border border-rule bg-paper p-4">
          <div className="flex items-center justify-between gap-3">
            <span className={`flex items-center gap-2 text-sm font-semibold ${accepted ? 'text-ok' : 'text-watch'}`}>
              {accepted ? <Icon.Check size={16} /> : <Icon.Info size={16} />}
              {accepted ? 'It would take this task' : 'It declined, or did not commit'}
            </span>
            <span className="t-readout text-[12px] text-ink-3">{result.latencyMs} ms</span>
          </div>
          {price && (
            <p className="text-sm">
              Quoted <span className="t-readout font-medium">{price}</span>
            </p>
          )}
          {reason && <p className="text-[13.5px] leading-relaxed text-ink-2">&ldquo;{reason.slice(0, 600)}&rdquo;</p>}
          {result.termsBound ? (
            <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <Icon.Shield size={14} className="text-ok" />
              Its registered wallet {shortAddress(result.verifiedSigner)} signed exactly these terms, price included.
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[12.5px] text-watch">
              <Icon.Alert size={14} />
              Signed by {shortAddress(result.verifiedSigner)}, but the signature does not cover these terms. Treat the price and answer as unverified.
            </p>
          )}
          <p className="text-[12px] leading-relaxed text-ink-3">{result.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
