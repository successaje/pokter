'use client';

import { useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { shortAddress, shortHash } from '@/lib/ui/format';
import type { PermissionSummary, SpendPeriod } from '@/lib/altana/permissions';
import type { GrantedSession } from '@/lib/altana/types';

interface GrantResponse {
  session: GrantedSession;
  onChain: boolean;
}

/**
 * §31 / §96. What the agent may do, what it may not, and what it costs you.
 *
 * The denied list is as prominent as the allowed list on purpose: a permission
 * screen that only shows grants teaches the user nothing about the boundary.
 * Both halves are enforced by the same on-chain allowlist.
 */
export function PermissionReview({
  summary,
  agent,
  explorerBase,
  isTestnet,
}: {
  summary: PermissionSummary;
  agent: { chainId: number; tokenId: string; name: string; category: string };
  explorerBase: string;
  isTestnet: boolean;
}) {
  const [spendCap, setSpendCap] = useState(0.05);
  const [period, setPeriod] = useState<SpendPeriod>('week');
  const [expiryDays, setExpiryDays] = useState(7);

  const [state, setState] = useState<'idle' | 'granting' | 'granted' | 'error'>(
    'idle',
  );
  const [result, setResult] = useState<GrantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const authorize = async () => {
    setState('granting');
    setError(null);

    try {
      const response = await fetch('/api/altana/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentChainId: agent.chainId,
          agentTokenId: agent.tokenId,
          agentName: agent.name,
          category: agent.category,
          spendCapBnb: spendCap,
          period,
          expiryDays,
        }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Grant failed.');

      setResult(body as GrantResponse);
      setState('granted');
    } catch (caught) {
      setError((caught as Error).message);
      setState('error');
    }
  };

  const revoke = async () => {
    if (!result) return;
    setRevoking(true);
    try {
      const response = await fetch(
        `/api/altana/session?id=${encodeURIComponent(result.session.id)}`,
        { method: 'DELETE' },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Revoke failed.');
      setResult({ ...result, session: body.session as GrantedSession });
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setRevoking(false);
    }
  };

  const revoked = Boolean(result?.session.revokedAt);

  return (
    <div className="flex flex-col gap-5">
      {isTestnet && (
        /* §39. Never blur testnet and mainnet. */
        <p className="rounded-[var(--radius)] border border-[color:var(--info)]/30 bg-[color:var(--info-dim)] px-3 py-2 text-[11px] text-[color:var(--info)]">
          BSC testnet (chain 97). Real transactions, real on-chain permissions,
          no real money.
        </p>
      )}

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
              min={0.001}
              max={1}
              step={0.005}
              value={spendCap}
              disabled={state !== 'idle' && state !== 'error'}
              onChange={(event) => setSpendCap(Number(event.target.value))}
              className="mono w-28 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--bg)] px-2.5 py-1.5 text-[13px]"
            />
            <span className="text-[13px] text-[color:var(--text-muted)]">BNB per</span>
            {(['day', 'week', 'month'] as SpendPeriod[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPeriod(option)}
                disabled={state !== 'idle' && state !== 'error'}
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
                disabled={state !== 'idle' && state !== 'error'}
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

      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] p-5">
        <h3 className="text-base font-medium">You remain in control.</h3>
        <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          The permissions above are enforced by the Altana account contract, not
          by Pokter. Any call outside them reverts on-chain. The session expires
          on its own, and you can revoke it at any moment.
        </p>

        {state !== 'granted' && (
          <button
            type="button"
            onClick={authorize}
            disabled={state === 'granting'}
            className="w-fit rounded-[var(--radius)] bg-[color:var(--text)] px-4 py-2 text-[13px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {state === 'granting' ? 'Registering session…' : 'Authorize agent'}
          </button>
        )}

        {error && (
          /* §61. Explain the failure rather than saying something went wrong. */
          <div className="rounded-[var(--radius)] border border-[color:var(--negative)]/30 bg-[color:var(--negative-dim)] p-3">
            <p className="text-[11px] font-medium text-[color:var(--negative)]">
              Authorization did not complete
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-secondary)]">
              {error}
            </p>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-2 border-t border-[color:var(--border)] pt-3">
            <p className="text-[11px] font-medium text-[color:var(--positive)]">
              {revoked ? 'Session revoked' : 'Agent activated'}
            </p>
            <dl className="flex flex-col gap-1 text-[11px]">
              <div className="flex justify-between gap-3">
                <dt className="text-[color:var(--text-faint)]">Session key</dt>
                <dd className="mono">{shortHash(result.session.publicKey)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[color:var(--text-faint)]">Wallet</dt>
                <dd className="mono">{shortAddress(result.session.walletAddress)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[color:var(--text-faint)]">Expires</dt>
                <dd className="mono">
                  {new Date(result.session.expiresAt).toISOString().slice(0, 16).replace('T', ' ')}
                </dd>
              </div>
              {result.session.grantTxHash && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[color:var(--text-faint)]">Grant tx</dt>
                  <dd>
                    <a
                      href={`${explorerBase}/tx/${result.session.grantTxHash}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mono text-[color:var(--info)] underline decoration-dotted underline-offset-2"
                    >
                      {shortHash(result.session.grantTxHash)}
                    </a>
                  </dd>
                </div>
              )}
              {result.session.revokeTxHash && (
                <div className="flex justify-between gap-3">
                  <dt className="text-[color:var(--text-faint)]">Revoke tx</dt>
                  <dd>
                    <a
                      href={`${explorerBase}/tx/${result.session.revokeTxHash}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mono text-[color:var(--info)] underline decoration-dotted underline-offset-2"
                    >
                      {shortHash(result.session.revokeTxHash)}
                    </a>
                  </dd>
                </div>
              )}
            </dl>

            {!revoked && (
              /* §57. Revocation is never buried. */
              <button
                type="button"
                onClick={revoke}
                disabled={revoking}
                className="mt-1 w-fit rounded-[var(--radius)] border border-[color:var(--negative)]/40 px-3 py-1.5 text-[12px] font-medium text-[color:var(--negative)] transition-colors hover:bg-[color:var(--negative-dim)] disabled:opacity-50"
              >
                {revoking ? 'Revoking…' : 'Revoke access'}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
