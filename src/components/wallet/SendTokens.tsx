'use client';

import { useState } from 'react';
import { formatUnits, type Address } from 'viem';

import { NATIVE_SYMBOL } from '@/lib/network/presentation';
import { sendFromPasskey } from '@/lib/wallet/send';
import {
  describeSendProblem,
  parseAmount,
  sendableNative,
  type SendableToken,
} from '@/lib/wallet/send-rules';
import { cn } from '@/lib/ui/cn';

const round = (raw: bigint) =>
  Number(formatUnits(raw, 18)).toLocaleString(undefined, { maximumFractionDigits: 5 });

/**
 * Sending out of a passkey wallet.
 *
 * The panel reported what this wallet held and gave no way to move any of
 * it, which makes a passkey a place funds arrive and do not leave — a
 * worse promise than the one being made when somebody is offered a wallet
 * they need no extension for.
 *
 * Both tokens, because gas here is the same asset as the one with value
 * and deciding for somebody which of their own holdings is spendable is
 * not this component's business. The only thing withheld is enough gas to
 * sign again, since a wallet without it cannot move anything, including
 * the tokens still in it.
 */
export function SendTokens({
  wallet,
  signer,
  nativeBalance,
  paymentBalance,
  onSent,
}: {
  wallet: { address: Address };
  signer: unknown;
  nativeBalance: bigint;
  paymentBalance: bigint;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<SendableToken>('payment');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const raw = parseAmount(amount);
  const problem = describeSendProblem({
    token,
    to,
    amount: raw,
    nativeBalance,
    paymentBalance,
    nativeSymbol: NATIVE_SYMBOL,
    paymentSymbol: '$U',
  });
  const held = token === 'native' ? nativeBalance : paymentBalance;
  const most = token === 'native' ? sendableNative(nativeBalance) : paymentBalance;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap mt-1 w-full rounded-[var(--radius)] border border-[color:var(--border)] px-3 py-2.5 text-left text-[12px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
      >
        Send tokens
        <span className="ml-auto float-right text-[color:var(--text-faint)]" aria-hidden>→</span>
      </button>
    );
  }

  return (
    <div className="mt-1 rounded-[var(--radius)] border border-[color:var(--border)] p-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium">Send tokens</p>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); setSent(null); }}
          className="tap text-[10px] text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
        >
          Close
        </button>
      </div>

      <div role="radiogroup" aria-label="Token to send" className="mt-2 grid grid-cols-2 gap-1.5">
        {([
          { id: 'payment' as const, label: '$U', balance: paymentBalance },
          { id: 'native' as const, label: NATIVE_SYMBOL, balance: nativeBalance },
        ]).map((choice) => (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={token === choice.id}
            onClick={() => { setToken(choice.id); setError(null); }}
            className={cn(
              'tap rounded-[var(--radius)] border px-2.5 py-2 text-left',
              token === choice.id
                ? 'border-[color:var(--brand)] bg-[color:var(--brand-highlight-soft)]'
                : 'border-[color:var(--border)]',
            )}
          >
            <span className="block text-[11px] font-medium">{choice.label}</span>
            <span className="mono block text-[9px] text-[color:var(--text-muted)]">
              {round(choice.balance)}
            </span>
          </button>
        ))}
      </div>

      <label className="mt-2 block">
        <span className="sr-only">Recipient address</span>
        <input
          value={to}
          onChange={(event) => { setTo(event.target.value); setError(null); }}
          placeholder="0x…"
          spellCheck={false}
          className="mono h-9 w-full rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-2.5 text-[11px] outline-none focus:border-[color:var(--border-focus)]"
        />
      </label>

      <div className="mt-2 flex items-center gap-1.5">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Amount</span>
          <input
            value={amount}
            onChange={(event) => { setAmount(event.target.value); setError(null); }}
            inputMode="decimal"
            placeholder="0.0"
            className="h-9 w-full rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-2.5 text-[12px] outline-none focus:border-[color:var(--border-focus)]"
          />
        </label>
        {/*
          Max is the sendable amount, not the balance. For gas they differ,
          and a Max that overdraws the reserve would be a button whose only
          outcome is the error beneath it.
        */}
        <button
          type="button"
          onClick={() => setAmount(formatUnits(most, 18))}
          className="tap shrink-0 rounded-[var(--radius)] border border-[color:var(--border)] px-2.5 py-2 text-[10px] font-medium"
        >
          Max
        </button>
      </div>

      <p className="mt-1.5 text-[10px] leading-4 text-[color:var(--text-muted)]">
        Holding {round(held)}
        {token === 'native' && ` · ${round(most)} sendable, the rest is kept for gas`}
      </p>

      {(error ?? (amount && problem)) && (
        <p role="alert" className="mt-2 text-[10px] leading-4 text-[color:var(--caution)]">
          {error ?? problem}
        </p>
      )}
      {sent && (
        <p className="mt-2 text-[10px] leading-4 text-[color:var(--positive)]">
          Sent. Transaction <span className="mono">{sent.slice(0, 10)}…</span>
        </p>
      )}

      <button
        type="button"
        disabled={busy || Boolean(problem)}
        onClick={async () => {
          setBusy(true);
          setError(null);
          setSent(null);
          try {
            const hash = await sendFromPasskey({
              wallet,
              signer,
              plan: { token, to: to.trim() as Address, amount: raw },
            });
            setSent(hash);
            setAmount('');
            setTo('');
            onSent?.();
          } catch (cause) {
            setError((cause as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        className="action-primary mt-2.5 w-full rounded-[var(--radius)] px-3 py-2 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Confirm in your wallet…' : 'Send'}
      </button>
    </div>
  );
}
