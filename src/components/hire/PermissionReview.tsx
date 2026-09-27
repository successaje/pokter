'use client';

import {
  CHAIN_ID,
  NATIVE_SYMBOL,
  NETWORK_LABEL,
} from '@/lib/network/presentation';
import { SPEND_CAP_BOUNDS, formatCapUsd } from '@/lib/altana/caps';
import { useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import {
  type PermissionSummary,
  type SpendPeriod,
} from '@/lib/altana/permissions';

/**
 * §31 / §96. What the agent may do, what it may not, and what it costs you.
 *
 * The denied list is as prominent as the allowed list on purpose: a permission
 * screen that only shows grants teaches the user nothing about the boundary.
 * Both halves are enforced by the same on-chain allowlist.
 */
export function PermissionReview({
  summary,
  isTestnet,
  bnbUsdPrice,
}: {
  summary: PermissionSummary;
  isTestnet: boolean;
  /** Null when pricing was unavailable; the figure is then omitted. */
  bnbUsdPrice: number | null;
}) {
  const [spendCap, setSpendCap] = useState(SPEND_CAP_BOUNDS.preset);
  const capUsd = formatCapUsd(spendCap, bnbUsdPrice);
  const [period, setPeriod] = useState<SpendPeriod>('week');
  const [expiryDays, setExpiryDays] = useState(7);

  return (
    <div className="flex flex-col gap-5">
      {isTestnet && (
        /* §39. Never blur testnet and mainnet. */
        <p className="rounded-[var(--radius)] border border-[color:var(--info)]/30 bg-[color:var(--info-dim)] px-3 py-2 text-[11px] text-[color:var(--info)]">
          {NETWORK_LABEL} (chain {CHAIN_ID}). Real transactions, real on-chain permissions,
          no real money.
        </p>
      )}

      {/*
        FE-02. This used to sit below the controls, so a visitor configured a
        spend cap and an expiry and only then learned that nothing would be
        created. The notice now comes first and reframes everything under it
        as a preview rather than a form — the controls stay visible because
        what a session *would* grant is the most useful thing on the page,
        but they no longer look like a decision waiting to be made.
      */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-5">
        <h3 className="text-base font-medium text-[color:var(--caution)]">
          Delegated access is paused
        </h3>
        <p className="text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
          {summary.delegationBlockedReason} Nothing below can be granted right
          now. You can still commission escrowed work in step 2, which pays for
          a single job and never touches your wallet&apos;s standing authority.
        </p>
        <p className="w-fit rounded-full border border-[color:var(--caution)]/40 px-3 py-1.5 text-[11px] font-medium text-[color:var(--caution)]">
          No wallet permission will be created
        </p>
      </section>

      <p className="text-[11px] uppercase tracking-widest text-[color:var(--text-faint)]">
        Preview · what a session would grant
      </p>

      <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
        <h3 className="border-b border-[color:var(--border)] px-4 py-3 text-[11px] font-medium uppercase tracking-widest text-[color:var(--text-muted)]">
          Agent permissions
        </h3>

        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-[color:var(--positive)]">
              Can call
            </p>
            {summary.readOnly ? (
              <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                Nothing. This agent monitors and reports — it is granted no
                authority to move funds at all.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {summary.allowed.map((contract) => (
                  <li key={contract.address} className="flex flex-col gap-0.5">
                    <span className="flex items-baseline gap-2 text-[12px]">
                      <span aria-hidden className="text-[color:var(--positive)]">
                        ✓
                      </span>
                      {contract.label}
                      <span className="mono text-[10px] text-[color:var(--text-faint)]">
                        {shortAddress(contract.address)}
                      </span>
                    </span>
                    <span className="pl-5 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                      {contract.capability}
                    </span>
                    <span className="pl-5 text-[10px] text-[color:var(--text-faint)]">
                      {contract.methods.length} method
                      {contract.methods.length === 1 ? '' : 's'} allowed
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-[color:var(--border)] pt-4">
            <p className="text-xs font-medium text-[color:var(--negative)]">
              Cannot call
            </p>
            <ul className="flex flex-col gap-1">
              {summary.denied.map((item) => (
                <li
                  key={item}
                  className="flex items-baseline gap-2 text-[11px] text-[color:var(--text-muted)]"
                >
                  <span aria-hidden className="text-[color:var(--negative)]">
                    ✕
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="spend-cap"
            className="text-xs text-[color:var(--text-muted)]"
          >
            Spend limit
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="spend-cap"
              type="number"
              min={SPEND_CAP_BOUNDS.min}
              max={SPEND_CAP_BOUNDS.max}
              step={SPEND_CAP_BOUNDS.step}
              value={spendCap}
              disabled
              onChange={(event) => setSpendCap(Number(event.target.value))}
              className="mono w-28 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-2.5 py-1.5 text-[13px]"
            />
            {/* A cap in BNB is not a quantity most people can weigh against
                their own risk. Omitted rather than guessed when pricing is
                unavailable. */}
            {capUsd && (
              <span className="tabular text-[12px] text-[color:var(--text-faint)]">
                ≈ {capUsd}
              </span>
            )}
            <span className="text-[13px] text-[color:var(--text-muted)]">
              {NATIVE_SYMBOL} per
            </span>
            {(['day', 'week', 'month'] as SpendPeriod[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPeriod(option)}
                disabled
                className={cn(
                  'rounded-[var(--radius)] border px-2.5 py-1.5 text-[13px] transition-colors',
                  period === option
                    ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)]'
                    : 'border-[color:var(--border)] text-[color:var(--text-muted)]',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="expiry"
            className="text-xs text-[color:var(--text-muted)]"
          >
            Expires after
          </label>
          <div className="flex flex-wrap gap-2">
            {[1, 7, 30].map((days) => (
              <button
                key={days}
                id={days === 1 ? 'expiry' : undefined}
                type="button"
                onClick={() => setExpiryDays(days)}
                disabled
                className={cn(
                  'rounded-[var(--radius)] border px-2.5 py-1.5 text-[13px] transition-colors',
                  expiryDays === days
                    ? 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)]'
                    : 'border-[color:var(--border)] text-[color:var(--text-muted)]',
                )}
              >
                {days} day{days === 1 ? '' : 's'}
              </button>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
