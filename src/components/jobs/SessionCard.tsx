'use client';

import { useState } from 'react';
import { formatEther } from 'viem';

import { shortAddress, shortHash } from '@/lib/ui/format';
import type { GrantedSession } from '@/lib/altana/types';

function remaining(expiresAt: string): string {
  const ms = Date.parse(expiresAt) - Date.now();
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * §56 / §57. A live delegation, with revoke kept prominent.
 *
 * Revocation is the control that makes delegation reversible, so it is a
 * primary action on the card rather than something behind a menu.
 */
export function SessionCard({
  session: initial,
  explorerBase,
}: {
  session: GrantedSession;
  explorerBase: string;
}) {
  const [session, setSession] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revoked = Boolean(session.revokedAt);
  const expired = Date.parse(session.expiresAt) <= Date.now();
  const active = !revoked && !expired;

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/altana/session?id=${encodeURIComponent(session.id)}`,
        { method: 'DELETE' },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Revoke failed.');
      setSession(body.session as GrantedSession);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-sm font-medium">{session.agentName}</h3>
          <p className="mono text-[11px] text-[color:var(--text-faint)]">
            wallet {shortAddress(session.walletAddress)}
            {session.isTestnet && ' · testnet'}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
          style={{
            borderColor: active
              ? 'color-mix(in srgb, var(--positive) 35%, transparent)'
              : 'var(--border-strong)',
            background: active ? 'var(--positive-dim)' : 'var(--surface-raised)',
            color: active ? 'var(--positive)' : 'var(--text-muted)',
          }}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {revoked ? 'Revoked' : expired ? 'Expired' : 'Active'}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-3 border-y border-[color:var(--border)] py-3 text-[11px]">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
            Spend cap
          </dt>
          <dd className="tabular text-[13px]">
            {formatEther(BigInt(session.spendCapWei))} BNB
            <span className="text-[color:var(--text-faint)]"> / {session.period}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
            {revoked ? 'Revoked' : 'Expires in'}
          </dt>
          <dd className="tabular text-[13px]">
            {revoked
              ? session.revokedAt!.slice(0, 10)
              : remaining(session.expiresAt)}
          </dd>
        </div>
      </dl>

      <dl className="flex flex-col gap-1 text-[11px]">
        <div className="flex justify-between gap-3">
          <dt className="text-[color:var(--text-faint)]">Session key</dt>
          <dd className="mono">{shortHash(session.publicKey)}</dd>
        </div>
        {session.grantTxHash && (
          <div className="flex justify-between gap-3">
            <dt className="text-[color:var(--text-faint)]">Grant tx</dt>
            <dd>
              <a
                href={`${explorerBase}/tx/${session.grantTxHash}`}
                target="_blank"
                rel="noreferrer noopener"
                className="mono text-[color:var(--info)] underline decoration-dotted underline-offset-2"
              >
                {shortHash(session.grantTxHash)}
              </a>
            </dd>
          </div>
        )}
        {session.revokeTxHash && (
          <div className="flex justify-between gap-3">
            <dt className="text-[color:var(--text-faint)]">Revoke tx</dt>
            <dd>
              <a
                href={`${explorerBase}/tx/${session.revokeTxHash}`}
                target="_blank"
                rel="noreferrer noopener"
                className="mono text-[color:var(--info)] underline decoration-dotted underline-offset-2"
              >
                {shortHash(session.revokeTxHash)}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {error && (
        <p className="rounded-[var(--radius)] border border-[color:var(--negative)]/30 bg-[color:var(--negative-dim)] p-2.5 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
          {error}
        </p>
      )}

      {active && (
        <button
          type="button"
          onClick={revoke}
          disabled={busy}
          className="w-fit rounded-[var(--radius)] border border-[color:var(--negative)]/40 px-3 py-1.5 text-[12px] font-medium text-[color:var(--negative)] transition-colors hover:bg-[color:var(--negative-dim)] disabled:opacity-50"
        >
          {busy ? 'Revoking…' : 'Revoke access'}
        </button>
      )}
    </article>
  );
}
