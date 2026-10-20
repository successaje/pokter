'use client';

import { useState } from 'react';
import { isAddress } from 'viem';

import { THRESHOLD_MAX, THRESHOLD_MIN, THRESHOLDS } from '@/lib/loan-watch/rules';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { Button, LinkButton } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Input } from '@/ui/Field';
import { Icon } from '@/ui/icons';

interface Reading {
  wallet: string;
  healthFactor: number | null;
  liquidatable: boolean;
  borrowUsd: number;
  drop: number | null;
  collateral: Array<{ symbol: string; usd: number }>;
  debt: Array<{ symbol: string; usd: number }>;
  block: string;
  readAt: string;
}

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 })}`;

function tone(hf: number | null, threshold: number): { label: string; className: string } {
  if (hf === null) return { label: 'No debt', className: 'bg-sunken text-ink-2' };
  if (hf < 1) return { label: 'Can be liquidated', className: 'bg-bad-wash text-bad' };
  if (hf < 1.1) return { label: 'Close to liquidation', className: 'bg-bad-wash text-bad' };
  if (hf < threshold) return { label: `Below ${threshold.toFixed(2)}`, className: 'bg-watch-wash text-watch' };
  return { label: 'Healthy', className: 'bg-ok-wash text-ok' };
}

/**
 * Check a Venus position now, and watch it by email.
 *
 * The check is a free read anyone can make: the position is public on
 * chain. The watch asks for an inbox and a threshold, and confirms the
 * inbox before anything is sent.
 */
export function LoanWatchPanel({ initialWallet, hireHref }: { initialWallet: string | null; hireHref: string }) {
  const [wallet, setWallet] = useState(initialWallet ?? '');
  const [reading, setReading] = useState<Reading | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number>(1.5);
  const [custom, setCustom] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const valid = isAddress(wallet.trim());
  const chosen = custom ? Number(custom) : threshold;
  const chosenValid = Number.isFinite(chosen) && chosen >= THRESHOLD_MIN && chosen <= THRESHOLD_MAX;

  const check = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid) return;
    setChecking(true);
    setCheckError(null);
    try {
      const r = await fetch(`/api/loan-watch/check?wallet=${wallet.trim()}`);
      const body = (await r.json().catch(() => ({}))) as Reading & { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Venus could not be read just now.');
      setReading(body);
    } catch (caught) {
      setCheckError((caught as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const watch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setState('sending');
    try {
      const r = await fetch('/api/loan-watch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, wallet: wallet.trim(), threshold: chosen }) });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'That did not go through.');
      setState('sent');
    } catch (caught) {
      setError((caught as Error).message);
      setState('idle');
    }
  };

  const t = reading ? tone(reading.healthFactor, chosenValid ? chosen : 1.5) : null;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="check-title" className="flex flex-col rounded-[18px] border border-rule bg-raised">
        <form onSubmit={check} className="flex flex-col gap-2 border-b border-rule p-5">
          <label id="check-title" htmlFor="loan-wallet" className="text-[15px] font-semibold">
            Your Venus position
          </label>
          <div className="flex gap-2">
            <Input id="loan-wallet" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x… the wallet that borrowed" className="t-readout min-w-0 flex-1" spellCheck={false} autoComplete="off" />
            <Button type="submit" disabled={!valid} busy={checking} className="shrink-0 self-stretch">
              Check now
            </Button>
          </div>
          <p className="text-[12px] text-ink-3">Read from Venus Core Pool on BNB Chain. Nothing to connect or sign.</p>
        </form>

        {checkError && (
          <div className="p-5">
            <Notice tone="bad">{checkError}</Notice>
          </div>
        )}

        {reading && t && (
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[12px] text-ink-3">Health factor</span>
                <span className="t-readout text-[40px] leading-none tracking-[-0.03em]">{reading.healthFactor === null ? '—' : reading.healthFactor.toFixed(3)}</span>
              </div>
              <span className={cn('rounded-full px-3 py-1 text-[13px] font-medium', t.className)}>{t.label}</span>
            </div>
            {reading.healthFactor !== null && (
              <p className="text-[14px] text-ink-2">
                {reading.drop && reading.drop > 0 ? (
                  <>
                    Liquidation if all collateral falls about <strong className="text-ink">{(reading.drop * 100).toFixed(1)}%</strong> together.
                  </>
                ) : (
                  'Venus reports a shortfall: this position can be liquidated now.'
                )}
              </p>
            )}
            {(reading.collateral.length > 0 || reading.debt.length > 0) && (
              <dl className="grid grid-cols-2 gap-4 text-[13px]">
                <div className="flex flex-col gap-1">
                  <dt className="t-label">Collateral</dt>
                  {reading.collateral.slice(0, 4).map((c) => (
                    <dd key={c.symbol} className="flex justify-between gap-2">
                      <span className="text-ink-2">{c.symbol}</span>
                      <span className="t-readout">{money(c.usd)}</span>
                    </dd>
                  ))}
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="t-label">Debt</dt>
                  {reading.debt.length === 0 ? (
                    <dd className="text-ink-3">None</dd>
                  ) : (
                    reading.debt.slice(0, 4).map((d) => (
                      <dd key={d.symbol} className="flex justify-between gap-2">
                        <span className="text-ink-2">{d.symbol}</span>
                        <span className="t-readout">{money(d.usd)}</span>
                      </dd>
                    ))
                  )}
                </div>
              </dl>
            )}
            <p className="text-[11.5px] text-ink-3">
              Block {reading.block} · read {new Date(reading.readAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
            {reading.healthFactor !== null && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-sunken px-4 py-3">
                <span className="text-[13px] text-ink-2">Want the exact repay or collateral that restores your target?</span>
                <LinkButton href={`${hireHref}?task=${encodeURIComponent(`Check the health of my Venus Core Pool position. Wallet: ${reading.wallet}\n\nReport the health factor, each market's collateral and debt, how far prices can fall before liquidation, and the repayment or added collateral that restores ${(chosenValid ? chosen : 1.5).toFixed(2)}.`)}`} size="s" intent="secondary">
                  Ask Brinkwatch
                </LinkButton>
              </div>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="alert-title" className="flex flex-col gap-4 rounded-[18px] border border-rule bg-raised p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-sunken text-ink-2">
            <Icon.Bell size={15} aria-hidden />
          </span>
          <h2 id="alert-title" className="text-[17px] font-semibold">
            Email me before it is liquidated
          </h2>
        </div>
        {state === 'sent' ? (
          <div className="flex flex-col gap-2">
            <p className="text-[14px] font-medium">Check your inbox</p>
            <p className="text-[13px] text-ink-2">
              We sent a link to {email}. Nothing is watched until you confirm it. Then we read {shortAddress(wallet.trim())} about every ten minutes.
            </p>
            <button type="button" onClick={() => setState('idle')} className="self-start text-[13px] font-medium text-ink-2 hover:text-ink">
              Watch another position
            </button>
          </div>
        ) : (
          <form onSubmit={watch} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium">Alert when the health factor falls below</span>
              <div role="radiogroup" aria-label="Threshold" className="flex flex-wrap gap-2">
                {THRESHOLDS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={!custom && threshold === v}
                    onClick={() => {
                      setThreshold(v);
                      setCustom('');
                    }}
                    className={cn('t-readout h-9 rounded-[9px] border px-3.5 text-[13.5px]', !custom && threshold === v ? 'border-ink bg-ink text-paper' : 'border-rule-strong text-ink-2 hover:text-ink')}
                  >
                    {v.toFixed(1)}
                  </button>
                ))}
                <Input value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="decimal" placeholder="Other" aria-label="Another threshold" className="t-readout h-9 w-24" />
              </div>
              {!chosenValid && <p className="text-[12px] text-watch">Between {THRESHOLD_MIN.toFixed(1)} and {THRESHOLD_MAX.toFixed(1)}.</p>}
              <p className="text-[12px] text-ink-3">You also hear if it falls under 1.1 or becomes liquidatable, every twelve hours while it stays there, and once when it recovers.</p>
            </div>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email address" autoComplete="email" />
            {error && <p className="text-[12.5px] text-bad">{error}</p>}
            <Button type="submit" busy={state === 'sending'} disabled={!valid || !chosenValid}>
              {valid ? `Watch ${shortAddress(wallet.trim())}` : 'Enter a wallet above first'}
            </Button>
            <p className="text-[11.5px] text-ink-3">Free. Confirmed by email first, and every alert has a one-click way to stop. Pokter never moves funds.</p>
          </form>
        )}
      </section>
    </div>
  );
}
