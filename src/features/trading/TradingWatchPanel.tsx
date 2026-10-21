'use client';

import { useCallback, useEffect, useState } from 'react';
import { isAddress } from 'viem';

import type { DelegatedTrader } from '@/lib/trading/agents';
import type { FlowVerdict } from '@/lib/trading/flows';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { Button } from '@/ui/Button';
import { Notice, Skeleton } from '@/ui/Feedback';
import { Input } from '@/ui/Field';
import { Icon } from '@/ui/icons';

interface WalletView {
  holdings: {
    wallet: string;
    bnb: string;
    tokens: Array<{ symbol: string; amount: string }>;
    positions: Array<{ tokenId: string; pair: string; feePct: number; liquidity: string; inRange: boolean | null }>;
    readAt: string;
  };
  watched: { addedAt: string; lastScanAt: string | null; lastError: string | null; owners: string[] } | null;
  flows: Array<{ txHash: string; block: number; at: string; verdict: FlowVerdict; note: string; sent: Array<{ symbol: string; amount: string; to: string }> }>;
  gaps: Array<{ fromBlock: number; toBlock: number }>;
  checkedTokens: string[];
}

const VERDICT: Record<FlowVerdict, { label: string; className: string }> = {
  returned: { label: 'Came back', className: 'bg-ok-wash text-ok' },
  'added-liquidity': { label: 'Into its own position', className: 'bg-ok-wash text-ok' },
  'to-owner': { label: 'To your other wallet', className: 'bg-sunken text-ink-2' },
  'not-returned': { label: 'Did not come back', className: 'bg-bad-wash text-bad' },
};

async function fetchWallet(address: string): Promise<WalletView> {
  const r = await fetch(`/api/trading/wallet?wallet=${address}`);
  const body = (await r.json().catch(() => ({}))) as WalletView & { error?: string };
  if (!r.ok) throw new Error(body.error ?? 'The chain could not be read just now.');
  return body;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'not yet');

/**
 * Watch a trading wallet an agent trades from under a delegated session.
 *
 * Everything here is read from chain: what the wallet holds, and every
 * transaction in which a token left it, judged by whether something came
 * back (lib/trading/flows.ts). The session's own limits are not shown,
 * because they cannot yet be read independently, and the page says so.
 */
export function TradingWatchPanel({ initialWallet, agentKey, trader }: { initialWallet: string | null; agentKey: string | null; trader: DelegatedTrader | null }) {
  const [wallet, setWallet] = useState(initialWallet ?? '');
  const [owners, setOwners] = useState('');
  const [view, setView] = useState<WalletView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (address: string) => setView(await fetchWallet(address)), []);

  useEffect(() => {
    if (!initialWallet || !isAddress(initialWallet)) return;
    let live = true;
    fetchWallet(initialWallet)
      .then((v) => live && setView(v))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [initialWallet]);

  const watch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAddress(wallet.trim())) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/trading/watch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.trim(), agent: agentKey, owners: owners.split(/[\s,]+/).filter(Boolean) }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'That did not go through.');
      await load(wallet.trim());
      const url = new URL(window.location.href);
      url.searchParams.set('wallet', wallet.trim());
      window.history.replaceState(null, '', url);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = view?.holdings.positions.filter((p) => p.liquidity !== '0') ?? [];
  const closed = (view?.holdings.positions.length ?? 0) - open.length;
  const flagged = view?.flows.filter((f) => f.verdict === 'not-returned').length ?? 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex flex-col gap-5">
        {!view?.watched && (
          <form onSubmit={watch} className="flex flex-col gap-3 rounded-[18px] border border-rule bg-raised p-5">
            <label htmlFor="trading-wallet" className="text-[15px] font-semibold">
              The wallet the agent trades from
            </label>
            <Input id="trading-wallet" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x…" className="t-readout" spellCheck={false} autoComplete="off" />
            <label htmlFor="trading-owners" className="text-[12.5px] text-ink-3">
              Your other wallets, if you move funds between them (optional, comma-separated)
            </label>
            <Input id="trading-owners" value={owners} onChange={(e) => setOwners(e.target.value)} placeholder="0x…, 0x…" className="t-readout" spellCheck={false} autoComplete="off" />
            <Button type="submit" busy={busy} disabled={!isAddress(wallet.trim())} className="self-start">
              Start watching
            </Button>
            <p className="text-[12px] text-ink-3">Read from BNB Chain. Nothing to connect or sign, and Pokter cannot move anything in this wallet.</p>
          </form>
        )}

        {error && <Notice tone="bad">{error}</Notice>}

        {view && (
          <>
            <section aria-labelledby="flows-title" className="flex flex-col rounded-[18px] border border-rule bg-raised">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-5 py-4">
                <h2 id="flows-title" className="text-[17px] font-semibold">
                  Every token that left {shortAddress(view.holdings.wallet)}
                </h2>
                <span className="text-[12px] text-ink-3">
                  {view.watched ? `Watching since ${when(view.watched.addedAt)} · last checked ${when(view.watched.lastScanAt)}` : 'Not watched'}
                </span>
              </header>
              {flagged > 0 && (
                <div className="px-5 pt-4">
                  <Notice tone="bad" title={`${flagged} transaction${flagged === 1 ? '' : 's'} where tokens did not come back`}>
                    Check {flagged === 1 ? 'it' : 'them'} on the explorer. If you did not make {flagged === 1 ? 'it' : 'them'}, revoke the agent’s session now.
                  </Notice>
                </div>
              )}
              {view.flows.length === 0 ? (
                <p className="px-5 py-6 text-[13.5px] text-ink-2">No token has left this wallet since watching began. Pokter checks about every ten minutes.</p>
              ) : (
                <ul className="ruled px-5">
                  {view.flows.map((f) => (
                    <li key={f.txHash} className="flex flex-col gap-1.5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[14px]">
                          {f.sent.map((s) => `${s.amount} ${s.symbol}`).join(' + ')} <span className="text-ink-3">out · {f.note}</span>
                        </span>
                        <a href={`https://bscscan.com/tx/${f.txHash}`} target="_blank" rel="noopener noreferrer" className="t-readout text-[11.5px] text-ink-3 hover:text-ink">
                          {when(f.at)} · {f.txHash.slice(0, 10)}… <Icon.ArrowUpRight size={11} className="inline" aria-hidden />
                        </a>
                      </span>
                      <span className={cn('w-fit shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-medium', VERDICT[f.verdict].className)}>{VERDICT[f.verdict].label}</span>
                    </li>
                  ))}
                </ul>
              )}
              {view.gaps.length > 0 && (
                <p className="border-t border-rule px-5 py-3 text-[12px] text-watch">
                  {view.gaps.length} stretch{view.gaps.length === 1 ? '' : 'es'} of blocks could not be checked (Pokter was offline longer than the public node keeps history). Anything in {view.gaps.length === 1 ? 'it' : 'them'} is not shown here.
                </p>
              )}
            </section>

            <section aria-labelledby="holdings-title" className="flex flex-col gap-3 rounded-[18px] border border-rule bg-raised p-5">
              <h2 id="holdings-title" className="text-[16px] font-semibold">
                What it holds now
              </h2>
              <dl className="ruled text-[13.5px]">
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-ink-2">BNB</dt>
                  <dd className="t-readout">{view.holdings.bnb}</dd>
                </div>
                {view.holdings.tokens.map((t) => (
                  <div key={t.symbol} className="flex justify-between gap-3 py-2">
                    <dt className="text-ink-2">{t.symbol}</dt>
                    <dd className="t-readout">{t.amount}</dd>
                  </div>
                ))}
                {open.map((p) => (
                  <div key={p.tokenId} className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-ink-2">
                      PancakeSwap {p.pair} {p.feePct}% <span className="t-readout text-ink-3">#{p.tokenId}</span>
                    </dt>
                    <dd className={cn('rounded-full px-2 py-0.5 text-[12px] font-medium', p.inRange ? 'bg-ok-wash text-ok' : 'bg-watch-wash text-watch')}>{p.inRange === null ? 'Range unknown' : p.inRange ? 'In range' : 'Out of range'}</dd>
                  </div>
                ))}
              </dl>
              {closed > 0 && <p className="text-[12px] text-ink-3">Plus {closed} closed position{closed === 1 ? '' : 's'} with no liquidity left.</p>}
            </section>
          </>
        )}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
        <section aria-labelledby="checks-title" className="flex flex-col gap-2.5 rounded-[18px] border border-rule p-5 text-[13px]">
          <h2 id="checks-title" className="text-[15px] font-semibold">
            What Pokter checks
          </h2>
          <p className="text-ink-2">In every transaction where a token leaves this wallet, something has to come back to it: tokens, a position, or liquidity in a position it holds.</p>
          <p className="text-ink-3">
            Tokens checked: {(view?.checkedTokens ?? ['WBNB', 'USDT', 'USDC', 'BTCB', 'ETH', 'CAKE', 'FDUSD', 'U']).join(', ')}, and the tokens of its positions. Not checked: BNB sent directly, and whether a price was fair.
          </p>
          <p className="text-ink-3">
            <span className="font-medium text-ink-2">Session limits:</span> not shown yet. Pokter cannot yet read a session’s caps and expiry from chain on its own, so it does not repeat the operator’s figures as checked.
          </p>
        </section>

        {trader && (
          <section aria-labelledby="controls-title" className="flex flex-col gap-2.5 rounded-[18px] border border-rule p-5 text-[13px]">
            <h2 id="controls-title" className="text-[15px] font-semibold">
              Stopping {trader.operator}’s {trader.product}
            </h2>
            <dl className="flex flex-col gap-2.5">
              <div>
                <dt className="font-medium">Pause</dt>
                <dd className="text-ink-2">{trader.controls.pause}</dd>
              </div>
              <div>
                <dt className="font-medium">Revoke</dt>
                <dd className="text-ink-2">{trader.controls.revoke}</dd>
              </div>
              <div>
                <dt className="font-medium">Withdraw</dt>
                <dd className="text-ink-2">{trader.controls.withdraw}</dd>
              </div>
            </dl>
            <a href={trader.setupUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-ink hover:underline">
              Open {trader.operator} <Icon.ArrowUpRight size={13} aria-hidden />
            </a>
            <p className="text-[11.5px] text-ink-3">As {trader.operator} describes it ({trader.source}). Pokter has not verified the controls.</p>
          </section>
        )}
        {!view && !error && initialWallet && <Skeleton className="h-40 w-full" />}
      </aside>
    </div>
  );
}
