'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/ui/Button';

/* Agents this browser has asked about, so a returning buyer sees that they did. Per viewer only. */
const ASKED_KEY = 'pokter.price-asked.v1';

function askedBefore(key: string): boolean {
  try {
    const list = JSON.parse(window.localStorage.getItem(ASKED_KEY) ?? '[]') as unknown;
    return Array.isArray(list) && list.includes(key);
  } catch {
    return false;
  }
}

function rememberAsked(key: string): void {
  try {
    const list = JSON.parse(window.localStorage.getItem(ASKED_KEY) ?? '[]') as unknown;
    const next = [key, ...(Array.isArray(list) ? list.filter((k) => k !== key) : [])].slice(0, 100);
    window.localStorage.setItem(ASKED_KEY, JSON.stringify(next));
  } catch {
    /* Not remembered; the ask still counted. */
  }
}

/**
 * "Ask for a price", on an agent that cannot be priced.
 *
 * The hire needs the agent's own signed price, so nothing here lets a
 * buyer hire it anyway. What a buyer can do is say they wanted it: the ask
 * is counted, without saying who, and the owner is told in Building and in
 * their notifications, with the fix. Following the agent is how the buyer
 * hears back when it signs one.
 */
export function AskForPrice({ chainId, tokenId, asks: initial }: { chainId: number; tokenId: string; asks: number }) {
  const key = `${chainId}:${tokenId}`;
  const [asked, setAsked] = useState(false);
  /* Read after mount: the server cannot see this browser's storage, and the first render has to match it. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from browser storage
    if (askedBefore(key)) setAsked(true);
  }, [key]);
  const [asks, setAsks] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/price-asks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainId, tokenId }),
      });
      const body = (await response.json().catch(() => ({}))) as { asks?: number; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'The ask was not recorded.');
      if (typeof body.asks === 'number') setAsks(body.asks);
      rememberAsked(key);
      setAsked(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col items-start gap-1.5">
      {asked ? (
        <p className="text-[12.5px] font-medium text-ok">You asked. Its owner is told on Pokter, with what to fix.</p>
      ) : (
        <Button size="s" intent="secondary" onClick={ask} busy={busy}>
          Ask for a price
        </Button>
      )}
      <p className="text-[12px] leading-snug text-ink-3">
        {asks > 0 ? `${asks} ${asks === 1 ? 'buyer has' : 'buyers have'} asked in the last 30 days. ` : 'Tells its owner a buyer wants it. '}
        Follow it to be emailed when it signs a price.
      </p>
      {error && <p className="text-[12px] text-bad">{error}</p>}
    </div>
  );
}
