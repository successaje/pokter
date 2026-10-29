'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

import { campaignTimeLeft, isCampaignLive } from '@/lib/campaign/window';
import { FAUCETS, IS_TESTNET, NATIVE_SYMBOL, NETWORK_LABEL, chainLabel } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { useDismissibleLayer } from '@/lib/ui/useDismissibleLayer';
import { buttonClass } from '@/ui/Button';
import { CopyButton } from '@/ui/Data';
import { Icon } from '@/ui/icons';
import { rememberedUsage } from '@/features/profile/usage';
import { useConnect } from './ConnectProvider';
import { useWalletState } from './useWalletState';

/* Whether the balances are shown in full, kept per browser: someone who opens them once usually wants them open. */
const DETAILS_KEY = 'pokter.wallet-balances-open';

function rememberedDetails(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(DETAILS_KEY) === '1';
  } catch {
    return false;
  }
}

function amount(value: number | null, digits = 2) {
  if (value === null) return '—';
  if (value > 0 && value < 0.01) return '<0.01';
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: Math.min(digits, 2) });
}

/**
 * The header's account control. Disconnected it is a quiet "Connect";
 * connected it is the address with a status dot, and opens a menu that leads
 * with what people open it for: how much they can spend.
 */
export function AccountButton({ compact }: { compact?: boolean }) {
  const w = useWalletState();
  const { openConnect } = useConnect();
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(rememberedDetails);
  // Read once: the countdown beside "Set and Earn" only needs the day, and the clock is not read during render.
  const [mountedAt] = useState(() => Date.now());
  const close = useCallback(() => setOpen(false), []);
  const layer = useDismissibleLayer<HTMLDivElement>({ open, onDismiss: close });

  if (!w.hydrated) {
    return <span className={cn(buttonClass('secondary', 's'), 'w-24 opacity-0')} aria-hidden />;
  }

  if (!w.address) {
    return (
      <button
        type="button"
        onClick={() => openConnect()}
        className={cn(buttonClass(w.wrongChain ? 'secondary' : 'secondary', 's'), w.wrongChain && 'border-watch text-watch')}
      >
        {w.wrongChain ? 'Wrong network' : compact ? 'Connect' : 'Connect wallet'}
      </button>
    );
  }

  const lowGas = w.balances.native !== null && w.balances.native < 0.002;
  /*
   * $U always, and any other offered token only when this wallet holds some:
   * a USDT line reading zero beside every $U balance is noise, but a buyer
   * who holds USDT should see it as spendable. Each in its own decimals.
   */
  const extraTokens = w.balances.tokens.filter((t) => !t.isDefault && t.amount !== null && t.amount > 0);
  /* The fee token of the chain these balances were read on, not the site's: BNB Chain's gas is BNB even on a testnet build. */
  const native = w.balances.chainId === 56 ? 'BNB' : w.balances.chainId === 97 ? 'tBNB' : NATIVE_SYMBOL;
  const testChain = (w.balances.chainId ?? (IS_TESTNET ? 97 : 56)) === 97;
  const network = w.balances.chainId === null ? NETWORK_LABEL : chainLabel(w.balances.chainId);
  const toggleDetails = () =>
    setDetails((was) => {
      try {
        window.localStorage.setItem(DETAILS_KEY, was ? '0' : '1');
      } catch {
        /* Not remembered; it still opens. */
      }
      return !was;
    });

  return (
    /*
     * In the header (compact) the menu is placed against the header on a
     * phone, 16px from each edge, as the search panel is, and against this
     * button from sm. Anchored to the button on a phone, a 20rem menu ran
     * off the left edge once the button sat further left.
     */
    <div ref={layer} className={compact ? 'sm:relative' : 'relative'}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        /* The address may be shortened or hidden on a phone; the name always carries it. */
        aria-label={`Wallet ${shortAddress(w.address)}`}
        className={cn(buttonClass('secondary', 's'), 'gap-2 pl-2.5')}
      >
        <span aria-hidden className={cn('size-1.5 rounded-full', w.mode === 'passkey' || w.mode === 'external' ? 'bg-ok' : 'bg-watch')} />
        {/*
          In the header (compact), the address narrows with the screen: the
          full short form from sm, its last four characters from 360px, and
          only the dot below that. At 375px the full form pushed the header
          13px past the screen's edge. The menu shows the address in full,
          with a copy button.
        */}
        {compact ? (
          <span aria-hidden className="t-readout hidden text-[12.5px] min-[360px]:inline">
            <span className="sm:hidden">…{w.address.slice(-4)}</span>
            <span className="hidden sm:inline">{shortAddress(w.address)}</span>
          </span>
        ) : (
          <span className="t-readout text-[12.5px]">{shortAddress(w.address)}</span>
        )}
        <Icon.ChevronDown size={14} className={cn('text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Your wallet"
          className={cn(
            'anim-rise absolute top-[calc(100%+8px)] z-50 overflow-hidden rounded-[14px] border border-rule bg-raised shadow-float',
            compact ? 'inset-x-4 sm:inset-x-auto sm:right-0 sm:w-[20rem]' : 'right-0 w-[20rem] max-w-[calc(100vw-2rem)]',
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="t-label">{w.mode === 'passkey' ? 'Passkey wallet' : (w.connectorName ?? 'Browser wallet')}</span>
              <span className="t-readout truncate text-[13px] text-ink-2">{shortAddress(w.address)}</span>
            </div>
            <CopyButton value={w.address} label="Copy address" />
          </div>

          {/*
            One line by default: what can be spent, on which network, and
            anything that needs attention. The other tokens, the fee balance
            and the network switch open beneath it, and stay open if the
            person leaves them so.
          */}
          <button
            type="button"
            onClick={toggleDetails}
            aria-expanded={details}
            aria-controls="wallet-balances"
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken/60"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="t-label">Spendable</span>
              <span className="t-readout text-xl">
                {amount(w.balances.payment)} <span className="text-[13px] text-ink-3">$U</span>
                {!details && extraTokens.length > 0 && <span className="ml-2 text-[12px] text-ink-3">+{extraTokens.length} more</span>}
              </span>
            </span>
            {/* Open, the network is said once, in the strip below with its switch. */}
            {!details && (
              <span className="flex shrink-0 flex-col items-end gap-0.5 text-[12px] text-ink-3">
                <span className="flex items-center gap-1.5">
                  <span className={cn('size-1.5 rounded-full', w.balances.unreadable ? 'bg-watch' : 'bg-signal')} aria-hidden />
                  {w.balances.unreadable === 'off-escrow-chain' ? <span className="text-watch">Other network</span> : network}
                </span>
                {lowGas && <span className="text-watch">Low {native} for fees</span>}
              </span>
            )}
            <Icon.ChevronDown size={15} className={cn('shrink-0 text-ink-3 transition-transform', details && 'rotate-180')} aria-hidden />
          </button>

          {details && (
            <div id="wallet-balances" className="flex flex-col border-t border-rule">
              <dl className="flex flex-col gap-1.5 px-4 py-3 text-[13px]">
                {extraTokens.map((t) => (
                  <div key={t.address} className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-3">{t.symbol}</dt>
                    <dd className="t-readout text-ink-2">{amount(t.amount)}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-3">Network fee</dt>
                  <dd className={cn('t-readout', lowGas ? 'text-watch' : 'text-ink-2')}>
                    {amount(w.balances.native, 4)} <span className="text-ink-3">{native}</span>
                  </dd>
                </div>
              </dl>

              {/*
                The network these figures were actually read on, not the one the
                site is configured for. A balance from another chain under this
                label is the error worth preventing here: a buyer decides what
                they can afford by reading it.
              */}
              <div className="flex flex-col gap-2 border-t border-rule bg-sunken px-4 py-2.5 text-[12px] text-ink-3">
                <div className="flex items-center gap-2">
                  <span className={cn('size-1.5 rounded-full', w.balances.unreadable ? 'bg-watch' : 'bg-signal')} aria-hidden />
                  {w.balances.unreadable === 'off-escrow-chain' ? (
                    <span className="text-watch">
                      {w.connectorName ?? 'Your wallet'} is on {w.externalChainName ?? 'another network'}. No balance is shown: it would be read on a different chain from the one you are on.
                    </span>
                  ) : (
                    <>
                      {network}
                      {w.balances.chainId === 97 && <span>· test tokens, no value</span>}
                    </>
                  )}
                </div>
                {w.escrowChains.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <span className="shrink-0">Use</span>
                    {w.escrowChains.map((id) => {
                      const active = w.balances.chainId === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => w.switchToChain(id)}
                          disabled={w.switching || active}
                          aria-current={active ? 'true' : undefined}
                          className={cn(
                            'rounded-[6px] border px-1.5 py-0.5 text-[11.5px] font-medium transition-colors',
                            active ? 'border-rule-strong bg-raised text-ink' : 'border-rule text-ink-3 hover:border-rule-strong hover:text-ink',
                            w.switching && 'opacity-60',
                          )}
                        >
                          {chainLabel(id)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* A failed switch is said whether or not the details are open: it was asked for from them, and may have closed since. */}
          {w.switchError && <p className="border-t border-rule bg-sunken px-4 py-2.5 text-[12px] text-watch">The wallet did not switch: {w.switchError.slice(0, 120)}</p>}

          {/* Test faucets only for balances read on the test network: on BNB Chain they would hand out tokens that pay for nothing there. */}
          {testChain && FAUCETS && (w.balances.payment === 0 || lowGas) && (
            <div className="flex flex-col gap-1.5 border-t border-rule px-4 py-3 text-[13px]">
              <span className="text-ink-2">Need test tokens?</span>
              <a className="link" href={FAUCETS.paymentTokenBot?.url ?? FAUCETS.paymentToken} target="_blank" rel="noreferrer noopener">
                Ask {FAUCETS.paymentTokenBot?.handle ?? 'the faucet'} for $U and {NATIVE_SYMBOL}
              </a>
              <a className="link text-ink-3" href={FAUCETS.native} target="_blank" rel="noreferrer noopener">
                {NATIVE_SYMBOL} web faucet
              </a>
            </div>
          )}

          <nav className="flex flex-col border-t border-rule py-1.5 text-sm" aria-label="Account">
            {[
              /* My workspace, My profile and Settings, the three an account is for. Hiring and Building are views inside the workspace; the wallet is there too. */
              /* Builders land in Building, everyone else in Hiring; both are one switch away. */
              { href: rememberedUsage(w.address) === 'build' ? '/build' : '/workspace', label: 'My workspace', icon: <Icon.Briefcase size={16} /> },
              { href: `/builders/${w.address}`, label: 'My profile', icon: <Icon.User size={16} /> },
              /* While the campaign runs: where this wallet stands, one click from the wallet that is being tracked. */
              ...(isCampaignLive() ? [{ href: '/set-and-earn', label: 'Set and Earn', icon: <Icon.Rocket size={16} />, note: campaignTimeLeft(mountedAt) }] : []),
              { href: '/account', label: 'Settings', icon: <Icon.Gear size={16} /> },
            ].map((item: { href: string; label: string; icon: React.ReactNode; note?: string }) => (
              <Link key={item.href} href={item.href} onClick={close} className="flex items-center gap-3 px-4 py-2 text-ink-2 hover:bg-sunken hover:text-ink">
                <span className="text-ink-3">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.note && <span className="text-[11.5px] text-ink-3">{item.note}</span>}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                if (w.mode === 'external') w.disconnectExternal();
                else w.passkey.forget();
                close();
              }}
              className="flex items-center gap-3 px-4 py-2 text-left text-ink-2 hover:bg-sunken hover:text-ink"
            >
              <span className="text-ink-3">
                <Icon.Logout size={16} />
              </span>
              {w.mode === 'external' ? 'Disconnect' : 'Sign out of this device'}
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
