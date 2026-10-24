'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';

import { formatQuoted } from '@/lib/network/tokens';
import { useLiveSignTypedData } from '@/lib/wallet/use-live-sign-typed-data';
import { useLiveSwitchChain } from '@/lib/wallet/use-live-switch-chain';
import { authorizationTypedData, paymentHeader, X402_CHAIN_ID, type X402Terms } from '@/lib/x402/exact';
import type { CallOutcome } from '@/lib/x402/call';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Textarea } from '@/ui/Field';

type Stage =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'terms'; terms: X402Terms }
  | { kind: 'signing'; terms: X402Terms }
  | { kind: 'sending'; terms: X402Terms; nonce: string }
  | { kind: 'done'; terms: X402Terms; outcome: CallOutcome; nonce: string | null };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function randomNonce(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Pay this agent for one call over x402, signed in the buyer's own browser
 * wallet. Shown only when the operator has turned x402 on. Reads the
 * seller's terms only when asked; shows recipient, price, network and how
 * long the signature lasts before anything is signed; and says plainly that
 * a direct payment has none of escrow's protection.
 */
export function X402Panel({ chainId, tokenId }: { chainId: number; tokenId: string }) {
  const { address, chain, isConnected } = useAccount();
  const { signTypedDataAsync } = useLiveSignTypedData();
  const { switchChainAsync } = useLiveSwitchChain();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [body, setBody] = useState('{\n  "task": ""\n}');
  const [error, setError] = useState<string | null>(null);
  /* Mounted on the buyer's click, so the terms are read at once, and once. */
  const started = useRef(false);

  const readTerms = async () => {
    setError(null);
    setStage({ kind: 'reading' });
    try {
      const response = await fetch(`/api/x402/terms?chainId=${chainId}&tokenId=${encodeURIComponent(tokenId)}`, { cache: 'no-store' });
      const data = (await response.json()) as { supported?: boolean; terms?: X402Terms; reason?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setStage(data.supported && data.terms ? { kind: 'terms', terms: data.terms } : { kind: 'unsupported', reason: data.reason ?? 'Not supported.' });
    } catch (reason) {
      setStage({ kind: 'idle' });
      setError(`The terms could not be read: ${(reason as Error).message}. Nothing was paid.`);
    }
  };

  const authorize = async (terms: X402Terms) => {
    setError(null);
    try {
      JSON.parse(body);
    } catch {
      setError('The request body is not valid JSON. Nothing was signed.');
      return;
    }
    if (!address) {
      setError('Connect a browser wallet first. A passkey wallet cannot sign this kind of payment.');
      return;
    }
    setStage({ kind: 'signing', terms });
    let nonce: `0x${string}`;
    let header: { name: string; value: string };
    try {
      if (chain?.id !== X402_CHAIN_ID) await switchChainAsync({ chainId: X402_CHAIN_ID });
      nonce = randomNonce();
      const { typedData, authorization } = authorizationTypedData(terms, address, Math.floor(Date.now() / 1000), nonce);
      const signature = await signTypedDataAsync(typedData);
      header = paymentHeader(terms, signature, authorization);
    } catch (reason) {
      setStage({ kind: 'terms', terms });
      setError(`Not signed: ${(reason as Error).message.split('\n')[0]}. Nothing was paid.`);
      return;
    }
    setStage({ kind: 'sending', terms, nonce });
    try {
      const response = await fetch('/api/x402/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId, tokenId, terms, header, body }),
      });
      const outcome = (await response.json()) as CallOutcome | { error: string };
      if ('error' in outcome) {
        setStage({ kind: 'terms', terms });
        setError(`${outcome.error} Nothing was sent.`);
        return;
      }
      setStage({ kind: 'done', terms, outcome, nonce });
    } catch {
      /* The answer to our own request was lost: the seller may have been paid. Never resend. */
      setStage({
        kind: 'done',
        terms,
        nonce,
        outcome: { kind: 'unavailable', reason: 'Pokter’s answer did not reach this page, so it is not known whether the call was sent. Do not pay again: open the receipt below.' },
      });
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void readTerms();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  const price = (t: X402Terms) => formatQuoted(t.asset, t.amountRaw)?.label ?? `${t.amountRaw} raw units`;

  return (
    <div className="flex flex-col gap-3">
      {stage.kind === 'reading' && <p className="text-[13px] text-ink-3" role="status">Reading the seller’s terms. Nothing is paid.</p>}
      {stage.kind === 'idle' && (
        <Button intent="secondary" size="s" className="self-start" onClick={() => void readTerms()}>
          Read the terms again
        </Button>
      )}

      {stage.kind === 'unsupported' && <p className="text-[13px] text-ink-3">{stage.reason}</p>}

      {(stage.kind === 'terms' || stage.kind === 'signing' || stage.kind === 'sending') && (
        <div className="flex flex-col gap-3">
          <dl className="ruled rounded-[12px] border border-rule bg-raised px-4 text-[13px]">
            {[
              ['Price', `${price(stage.terms)} per call`],
              ['Paid to', short(stage.terms.payTo)],
              ['Network', 'BNB Chain · Mainnet · real funds'],
              ['Signature valid for', `${Math.min(stage.terms.maxTimeoutSeconds, 300)} seconds`],
              ['Endpoint', stage.terms.endpoint],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)]">
                <dt className="text-ink-3">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>
          {stage.terms.description && <p className="text-[12.5px] text-ink-3">The seller says: &ldquo;{stage.terms.description}&rdquo;</p>}
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="text-ink-2">Request body (JSON, as the seller asks for it)</span>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-24 t-readout text-[12.5px]" disabled={stage.kind !== 'terms'} />
          </label>
          <Button
            className="self-start"
            busy={stage.kind === 'signing' || stage.kind === 'sending'}
            disabled={stage.kind !== 'terms' || !isConnected}
            onClick={() => stage.kind === 'terms' && void authorize(stage.terms)}
          >
            {stage.kind === 'sending' ? 'Sending once…' : `Sign and pay ${price(stage.terms)}`}
          </Button>
          {!isConnected && <p className="text-[12.5px] text-ink-3">Connect a browser wallet to sign. It signs a transfer of exactly this amount to this recipient, and nothing else.</p>}
        </div>
      )}

      {stage.kind === 'done' && (
        <div className="flex flex-col gap-2" role="status">
          {stage.outcome.kind === 'answered' && (
            <>
              <Notice tone="ok" title={stage.outcome.replayed ? 'Already answered: shown again, not paid again' : 'Answered'}>
                {stage.outcome.call.settlementTx ? `Settled in ${short(stage.outcome.call.settlementTx)}.` : 'The seller did not report a settlement transaction.'}
              </Notice>
              <pre className="max-h-64 overflow-auto rounded-[10px] bg-sunken p-3 text-[12px]">{stage.outcome.call.responseText}</pre>
            </>
          )}
          {stage.outcome.kind === 'refused' && <Notice tone="bad" title="The seller did not answer the call">{stage.outcome.call.error}</Notice>}
          {stage.outcome.kind === 'unknown' && <Notice tone="watch" title="Outcome unknown">{stage.outcome.call.error}</Notice>}
          {stage.outcome.kind === 'already-sent' && <Notice tone="watch" title="Already sent">This authorization was already sent once; it is not sent again. See its receipt.</Notice>}
          {stage.outcome.kind === 'terms-changed' && (
            <Notice tone="watch" title="The seller’s terms changed" action={<Button size="s" intent="secondary" onClick={() => setStage({ kind: 'terms', terms: (stage.outcome as { fresh: X402Terms }).fresh })}>Review the new terms</Button>}>
              {stage.outcome.reason}
            </Notice>
          )}
          {(stage.outcome.kind === 'unavailable' || stage.outcome.kind === 'invalid') && <Notice tone="bad" title="Not sent">{stage.outcome.reason}</Notice>}
          {stage.nonce && (
            <a className="link text-[12.5px]" href={`/api/x402/calls/${stage.nonce}`} target="_blank" rel="noreferrer">
              Receipt for this payment
            </a>
          )}
          {stage.outcome.kind !== 'answered' && stage.outcome.kind !== 'terms-changed' && (
            <Button size="s" intent="ghost" className="self-start" onClick={() => setStage({ kind: 'terms', terms: stage.terms })}>
              Back to the terms (your request is kept)
            </Button>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
    </div>
  );
}
