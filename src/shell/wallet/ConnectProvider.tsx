'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { MAINNET_ESCROW, NETWORK_LABEL, IS_TESTNET } from '@/lib/network/presentation';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { cn } from '@/lib/ui/cn';
import { useWalletState } from './useWalletState';
import { connectErrorMessage } from '@/lib/wallet/errors';

interface ConnectContextValue {
  /**
   * Opens the connect sheet. `reason` says why, in the person's terms.
   * `passkeyUnavailable`, when set, is why a passkey wallet cannot do what is
   * being connected for (a hire in a token it cannot fund): the option is
   * shown disabled with that reason, before anyone creates one.
   */
  openConnect: (reason?: string, options?: { passkeyUnavailable?: string }) => void;
}

const ConnectContext = createContext<ConnectContextValue>({ openConnect: () => {} });

export function useConnect() {
  return useContext(ConnectContext);
}

/**
 * The single place a wallet gets connected. Any page asks for it with
 * `openConnect('to hire this agent')` at the moment a wallet is actually
 * needed; browsing never does.
 */
export function ConnectProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [reason, setReason] = useState<string | null>(null);
  const [passkeyUnavailable, setPasskeyUnavailable] = useState<string | null>(null);
  const openConnect = useCallback((why?: string, options?: { passkeyUnavailable?: string }) => {
    setReason(why ?? null);
    setPasskeyUnavailable(options?.passkeyUnavailable ?? null);
    setSession((n) => n + 1);
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ openConnect }), [openConnect]);
  const close = useCallback(() => setOpen(false), []);
  const reopen = useCallback(() => setOpen(true), []);
  return (
    <ConnectContext.Provider value={value}>
      {children}
      <ConnectSheet key={session} open={open} reason={reason} passkeyUnavailable={passkeyUnavailable} onClose={close} onReopen={reopen} />
    </ConnectContext.Provider>
  );
}

function ConnectSheet({ open, reason, passkeyUnavailable, onClose, onReopen }: { open: boolean; reason: string | null; passkeyUnavailable: string | null; onClose: () => void; onReopen: () => void }) {
  const w = useWalletState();
  const [view, setView] = useState<'choose' | 'passkey'>('choose');

  /*
   * WalletConnect draws its own QR and wallet-list modal as an ordinary page
   * element, and this sheet is a native <dialog> in the browser's top layer,
   * which nothing on the page can cover. So the WalletConnect modal opened
   * behind the sheet, most visibly on phones. The sheet now steps aside for
   * it, and comes back with the error if the connection fails or is closed.
   */
  const handedOff = useRef(false);
  const connectWalletConnect = () => {
    handedOff.current = true;
    onClose();
    w.connectWalletConnect();
  };
  useEffect(() => {
    if (!handedOff.current || open) return;
    // Back with the error, or to switch a wallet that connected on another network.
    if (w.connectError || (w.address && w.wrongChain)) {
      handedOff.current = false;
      onReopen();
    } else if (w.address) {
      handedOff.current = false;
    }
  }, [open, w.connectError, w.address, w.wrongChain, onReopen]);

  // Close once something can sign. A browser wallet on the wrong network is
  // not "connected" for our purposes; the sheet stays open to switch it.
  const signing = Boolean(w.address) && !w.wrongChain;
  useEffect(() => {
    if (open && signing) onClose();
  }, [open, signing, onClose]);

  const passkeyBusy = w.passkey.busy;

  return (
    <Sheet
      open={open}
      onClose={() => {
        w.resetConnect();
        onClose();
      }}
      title={view === 'passkey' ? 'Passkey wallet' : 'Connect a wallet'}
      description={reason ? `You need a wallet ${reason}. Browsing never does.` : 'Browsing Pokter never needs a wallet. You need one to hire, review or publish.'}
    >
      {w.wrongChain && w.externalConnected ? (
        <div className="flex flex-col gap-4">
          <Notice tone="watch" title={`${w.connectorName ?? 'Your wallet'} is on ${w.externalChainName ?? 'another network'}`}>
            Pokter&rsquo;s default network is {NETWORK_LABEL}. A hire funded on another network asks you to switch when you
            fund it. Switching only changes the network your wallet points at; it moves no funds.
          </Notice>
          {w.switchError && <Notice tone="bad" title="The switch was not completed">{w.switchError}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={w.switchToEscrowChain} busy={w.switching}>
              Switch to {NETWORK_LABEL}
            </Button>
            <Button intent="ghost" onClick={w.disconnectExternal}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : view === 'choose' ? (
        <div className="flex flex-col gap-3">
          <Option
            icon={<Icon.Wallet />}
            title={w.injectedAvailable ? 'Browser wallet' : 'Wallet app'}
            badge={w.injectedAvailable || w.walletConnectAvailable ? 'Recommended' : undefined}
            detail={
              w.injectedAvailable
                ? 'MetaMask, Rabby, Trust or any wallet in this browser. The same address works on every marketplace, so your activity counts everywhere, including for Set and Earn.'
                : w.walletConnectAvailable
                  ? 'Scan a code with Trust Wallet, MetaMask mobile or any WalletConnect wallet. The same address works on every marketplace.'
                  : 'No wallet was found in this browser. Use a passkey wallet, or open Pokter in a browser that has one.'
            }
            onClick={() => (w.injectedAvailable ? w.connectInjected() : connectWalletConnect())}
            busy={w.connecting}
            disabled={!w.injectedAvailable && !w.walletConnectAvailable}
          />
          {w.injectedAvailable && w.walletConnectAvailable && (
            <button type="button" onClick={connectWalletConnect} className="self-start text-[13px] font-medium text-ink-2 link">
              Use a phone wallet instead (WalletConnect)
            </button>
          )}
          <Option
            icon={<Icon.Key />}
            title="Passkey wallet"
            detail="Face ID, Touch ID or your device PIN, nothing to install, and Pokter covers the fee for hires. Its address only works on Pokter, not on other marketplaces."
            onClick={() => setView('passkey')}
            disabled={Boolean(passkeyUnavailable) || (w.ready && !w.passkey.supported)}
            disabledReason={passkeyUnavailable ?? 'This browser cannot create passkeys.'}
          />
          {w.connectError && (
            <Notice tone="bad" title="The wallet did not connect">
              {connectErrorMessage(w.connectError)}
            </Notice>
          )}
          <p className="pt-2 text-[12.5px] leading-relaxed text-ink-3">
            Connecting shares your address with Pokter. It grants no permission to move funds: every payment is a
            separate transaction you approve, into one escrow for one job.
            {IS_TESTNET && (MAINNET_ESCROW ? ' Balances shown on BNB Testnet are test tokens with no value; hires on BNB Chain use real funds.' : ' Pokter runs on BNB testnet; balances are test tokens with no value.')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink-2">
            A passkey wallet is a smart account on {NETWORK_LABEL} secured by a passkey on this device. Pokter never
            holds the key. If you made one before on any device synced to the same passkey account, restore it instead
            of creating a new one, or you will have two addresses.
          </p>
          {w.passkey.error && <Notice tone="bad" title="The passkey step did not finish">{w.passkey.error}</Notice>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void w.passkey.create()} busy={passkeyBusy === 'creating'} disabled={passkeyBusy !== null} className="sm:flex-1">
              Create a passkey wallet
            </Button>
            <Button intent="secondary" onClick={() => void w.passkey.recover()} busy={passkeyBusy === 'recovering'} disabled={passkeyBusy !== null} className="sm:flex-1">
              I already have one
            </Button>
          </div>
          {passkeyBusy && (
            <p className="text-[13px] text-ink-3" role="status">
              Waiting for your device&rsquo;s passkey prompt…
            </p>
          )}
          <button type="button" onClick={() => setView('choose')} className="inline-flex items-center gap-1 self-start text-[13px] text-ink-3 hover:text-ink">
            <Icon.ChevronLeft size={14} /> Other ways to connect
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Option({
  icon,
  title,
  detail,
  badge,
  onClick,
  busy,
  disabled,
  disabledReason,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  badge?: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        'group flex w-full items-start gap-4 rounded-[12px] border border-rule-strong bg-raised p-4 text-left transition-[border-color,box-shadow] duration-150',
        'hover:border-ink hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-rule-strong disabled:hover:shadow-none',
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-sunken text-ink">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          {title}
          {badge && <span className="rounded-full bg-signal-wash px-2 py-0.5 text-[11px] font-medium text-ink">{badge}</span>}
        </span>
        <span className="text-[13px] leading-snug text-ink-3">{disabled && disabledReason ? disabledReason : detail}</span>
      </span>
      <span className="mt-2 text-ink-3 transition-transform group-hover:translate-x-0.5">
        {busy ? <span className="text-[12px]">Waiting…</span> : <Icon.ChevronRight />}
      </span>
    </button>
  );
}
