'use client';

import { useState } from 'react';

import { FAUCETS, NATIVE_SYMBOL } from '@/lib/network/presentation';

/**
 * What to do about an empty wallet, written out ready to send.
 *
 * The faucet bot answers a message, and the message has to name the token
 * and carry the address. Somebody who has just been told they have no gas
 * is the least well placed to compose that, so it is composed here with
 * their own address already in it — and both tokens are offered, because
 * publishing needs gas while hiring needs $U and "get funds" does not say
 * which one is missing.
 */
export function LowBalanceHelp({ address }: { address: string }) {
  const bot = FAUCETS?.paymentTokenBot;
  const [copied, setCopied] = useState<string | null>(null);
  if (!bot) return null;

  const asks = [
    { id: 'native', label: `Ask for ${NATIVE_SYMBOL}`, text: bot.nativeAsk.replace('ADDRESS', address) },
    { id: 'payment', label: 'Ask for $U', text: bot.ask.replace('ADDRESS', address) },
  ];

  return (
    <div className="rounded-[var(--radius)] border border-[color:var(--info)]/25 bg-[color:var(--info-dim)] p-3">
      <p className="text-[12px] leading-5 text-[color:var(--text-secondary)]">
        <strong className="text-[color:var(--text)]">This wallet has no gas here.</strong>{' '}
        Message{' '}
        <a
          href={bot.url}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-[color:var(--info)] underline underline-offset-2"
        >
          {bot.handle}
        </a>{' '}
        on Telegram with one of these. They are test tokens and cost nothing.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {asks.map((ask) => (
          <button
            key={ask.id}
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(ask.text);
                setCopied(ask.id);
                window.setTimeout(() => setCopied(null), 1500);
              } catch {
                /* Clipboard refused; the text is on screen to copy by hand. */
              }
            }}
            className="tap flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-left"
          >
            <span className="mono min-w-0 truncate text-[11px] text-[color:var(--text-secondary)]">
              {ask.text}
            </span>
            <span className="shrink-0 text-[10px] font-semibold text-[color:var(--info)]">
              {copied === ask.id ? 'Copied' : ask.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
