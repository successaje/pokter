'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

import { FAUCETS, IS_TESTNET, NATIVE_SYMBOL, NETWORK_LABEL } from '@/lib/network/presentation';
import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { useDismissibleLayer } from '@/lib/ui/useDismissibleLayer';
import { buttonClass } from '@/ui/Button';
import { CopyButton } from '@/ui/Data';
import { Icon } from '@/ui/icons';
import { useConnect } from './ConnectProvider';
import { useWalletState } from './useWalletState';

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

  return (
    <div ref={layer} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(buttonClass('secondary', 's'), 'gap-2 pl-2.5')}
      >
        <span aria-hidden className={cn('size-1.5 rounded-full', w.mode === 'passkey' || w.mode === 'external' ? 'bg-ok' : 'bg-watch')} />
        <span className="t-readout text-[12.5px]">{shortAddress(w.address)}</span>
        <Icon.ChevronDown size={14} className={cn('text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Your wallet"
          className="anim-rise absolute right-0 top-[calc(100%+8px)] z-50 w-[20rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[14px] border border-rule bg-raised shadow-float"
        >
          <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="t-label">{w.mode === 'passkey' ? 'Passkey wallet' : (w.connectorName ?? 'Browser wallet')}</span>
              <span className="t-readout truncate text-[13px] text-ink-2">{shortAddress(w.address)}</span>
            </div>
            <CopyButton value={w.address} label="Copy address" />
          </div>

          <div className="grid grid-cols-2 gap-px bg-rule">
            <div className="flex flex-col gap-0.5 bg-raised px-4 py-3">
              <span className="t-label">Spendable</span>
              <span className="t-readout text-xl">
                {amount(w.balances.payment)} <span className="text-[13px] text-ink-3">$U</span>
              </span>
            </div>
            <div className="flex flex-col gap-0.5 bg-raised px-4 py-3">
              <span className="t-label">Network fee</span>
              <span className={cn('t-readout text-xl', lowGas && 'text-watch')}>
                {amount(w.balances.native, 4)} <span className="text-[13px] text-ink-3">{NATIVE_SYMBOL}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 border-y border-rule bg-sunken px-4 py-2 text-[12px] text-ink-3">
            <span className="size-1.5 rounded-full bg-signal" aria-hidden />
            {NETWORK_LABEL}
            {IS_TESTNET && <span>· test tokens, no value</span>}
          </div>

          {IS_TESTNET && FAUCETS && (w.balances.payment === 0 || lowGas) && (
            <div className="flex flex-col gap-1.5 border-b border-rule px-4 py-3 text-[13px]">
              <span className="text-ink-2">Need test tokens?</span>
              <a className="link" href={FAUCETS.paymentTokenBot?.url ?? FAUCETS.paymentToken} target="_blank" rel="noreferrer noopener">
                Ask {FAUCETS.paymentTokenBot?.handle ?? 'the faucet'} for $U and {NATIVE_SYMBOL}
              </a>
              <a className="link text-ink-3" href={FAUCETS.native} target="_blank" rel="noreferrer noopener">
                {NATIVE_SYMBOL} web faucet
              </a>
            </div>
          )}

          <nav className="flex flex-col py-1.5 text-sm" aria-label="Account">
            {[
              { href: '/workspace', label: 'Workspace', icon: <Icon.Briefcase size={16} /> },
              { href: '/workspace/wallet', label: 'Wallet and payments', icon: <Icon.Wallet size={16} /> },
              { href: '/studio', label: 'Builder Studio', icon: <Icon.Layers size={16} /> },
              { href: '/account', label: 'Account and settings', icon: <Icon.Gear size={16} /> },
            ].map((item) => (
              <Link key={item.href} href={item.href} onClick={close} className="flex items-center gap-3 px-4 py-2 text-ink-2 hover:bg-sunken hover:text-ink">
                <span className="text-ink-3">{item.icon}</span>
                {item.label}
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
