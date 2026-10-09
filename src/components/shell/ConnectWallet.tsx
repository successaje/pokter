'use client';

import { FAUCETS, NATIVE_SYMBOL, PAYMENT_VALUE_NOTE } from '@/lib/network/presentation';
import { useQuery } from '@tanstack/react-query';
import { formatEther, formatUnits } from 'viem';
import { useCallback, useState, type ReactNode } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import Link from 'next/link';

import { cn } from '@/lib/ui/cn';
import { SendTokens } from '@/components/wallet/SendTokens';
import { LowBalanceHelp } from '@/components/builder/LowBalanceHelp';
import { GAS_RESERVE } from '@/lib/wallet/send-rules';
import { shortAddress } from '@/lib/ui/format';
import { ESCROW_CHAIN } from '@/lib/wallet/config';
import { usePasskeyWallet, usePasskeySigner } from '@/components/wallet/PasskeyProvider';
import { useActiveWallet } from '@/lib/wallet/active';
import { useDismissibleLayer } from '@/lib/ui/useDismissibleLayer';
import { useHydrated } from '@/lib/ui/use-hydrated';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import { externalBalances, hasInjectedWallet } from '@/lib/wallet/external';
import { walletActionError } from '@/lib/wallet/errors';

function SigningIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-none stroke-current" strokeWidth="1.8">
      <path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" />
      <path d="m9.2 12 1.8 1.8 3.8-4" />
    </svg>
  );
}

function IdentityIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-none stroke-current" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M16 12h5M7 9h5M7 13h3" />
    </svg>
  );
}

function GasIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="m13 2-7 11h5l-1 9 8-12h-5V2Z" />
    </svg>
  );
}

function EscrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth="1.8">
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <path d="M7 7V5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v2M12 11v5" />
    </svg>
  );
}

/**
 * A wallet panel row: icon, what it is, what it is doing, and — only when
 * there is somewhere to go — a chevron.
 *
 * The chevron is not decoration. A row that carries one must act when you
 * press it; a row that merely reports a state (the passkey is active, the
 * browser wallet is on the wrong network) gets none, because an arrow that
 * leads nowhere is a promise the panel cannot keep.
 */
function WalletRow({
  icon,
  title,
  detail,
  href,
  onClick,
  tone,
  accent,
}: {
  icon: ReactNode;
  title: string;
  detail: ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: 'caution';
  /*
   * A hue per kind of row.
   *
   * Every icon was the same faint grey, so the column read as texture and
   * the eye had to fall back on the words to tell a signing wallet from a
   * copy button. Colour here is a second channel on top of the label and
   * the glyph, never the only one carrying the meaning.
   */
  accent?: 'brand' | 'positive' | 'info';
}) {
  const body = (
    <>
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-[var(--radius)]',
          tone === 'caution'
            ? 'bg-[color:var(--caution-dim)] text-[color:var(--caution)]'
            : accent === 'positive'
              ? 'bg-[color:var(--positive-dim)] text-[color:var(--positive)]'
              : accent === 'info'
                ? 'bg-[color:var(--info-dim)] text-[color:var(--info)]'
                : accent === 'brand'
                  ? 'bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand-strong)]'
                  : 'bg-[color:var(--bg-subtle)] text-[color:var(--text-muted)]',
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 text-left">
        <span className="text-[13px] font-medium leading-tight">{title}</span>
        <span className="truncate text-[11px] leading-tight text-[color:var(--text-muted)]">
          {detail}
        </span>
      </span>
      {(href || onClick) && (
        <span aria-hidden className="ml-auto text-[color:var(--text-faint)]">
          <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="2">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
      )}
    </>
  );

  const className =
    'flex w-full items-center gap-3 border-t border-[color:var(--border)] px-1 py-3 text-left transition-colors first:border-t-0 hover:bg-[color:var(--surface-hover)]';

  if (href) {
    return (
      <a href={href} className={className}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={cn(className, 'hover:bg-transparent')}>{body}</div>;
}

/**
 * §59. Wallet connection.
 *
 * Two kinds of wallet, deliberately not presented as equals.
 *
 * A **passkey wallet** is the one that can actually act: the P256 key lives in
 * this device's secure enclave, and it signs session grants without Pokter
 * ever holding a key. That is why it leads.
 *
 * A **browser wallet** identifies you and drives network switching, but cannot
 * sign an Altana session — the SDK has no injected signer, and browser wallets
 * no longer expose the raw digest signing one would need. Offering it as an
 * equal option would imply a capability it does not have.
 */
export function ConnectWallet() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const layerRef = useDismissibleLayer<HTMLDivElement>({
    open,
    onDismiss: close,
  });

  const passkey = usePasskeyWallet();
  const passkeySigner = usePasskeySigner();
  const paymentToken = correctedErc8183Addresses(
    WALLET_NETWORK.chainId,
  ).paymentToken;
  const balances = useQuery({
    queryKey: ['passkey-readiness', passkey.wallet?.address, paymentToken],
    queryFn: () =>
      walletClient().balances({
        wallet: passkey.wallet!.address,
        tokens: [paymentToken],
      }),
    enabled: Boolean(passkey.wallet),
    refetchInterval: 30_000,
  });
  const paymentBalance = balances.data?.tokens?.[0];

  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  /*
   * Two ways in, because a phone has no injected provider.
   *
   * Registration is not availability: wagmi lists the injected connector
   * whether or not an extension exists, so picking it off `connectors` by id
   * would have offered "Connect wallet" to every phone and failed at the
   * prompt. What matters is whether anything is actually on `window`, which
   * is a browser fact and so is read after hydration — before that the
   * server and the client disagree, and the panel is the one place that
   * disagreement would be visible.
   */
  const hydrated = useHydrated();
  const hasInjected =
    hydrated && typeof window !== 'undefined' && Boolean(hasInjectedWallet());
  const injected = hasInjected
    ? (connectors.find((c) => c.id === 'injected') ?? null)
    : null;
  const walletConnectConnector =
    connectors.find((c) => c.id === 'walletConnect') ?? null;
  const primaryConnector =
    injected ?? walletConnectConnector ?? connectors.find((c) => c.id === 'injected') ?? null;
  const wrongChain = isConnected && chain?.id !== ESCROW_CHAIN.id;
  const active = useActiveWallet();
  /*
   * The signing wallet's address, not the first one that happens to exist.
   *
   * This read the passkey's whenever there was one, so a panel headed "hiring
   * from your own wallet" printed a different account underneath it.
   */
  const connectedAddress = active.address ?? passkey.wallet?.address ?? address;
  /*
   * The balance of the wallet that will actually sign.
   *
   * This panel read the passkey's balance whatever was connected, so a buyer
   * hiring from their own wallet was shown a number belonging to a different
   * account — and the one figure this panel exists to answer, whether there is
   * enough to hire with, was about the wrong wallet.
   */
  const externalBalance = useQuery({
    queryKey: ['connect-external', address],
    queryFn: () => externalBalances(),
    enabled: isConnected && !wrongChain,
    refetchInterval: 30_000,
  });
  const anyConnected = Boolean(connectedAddress);

  return (
    <div ref={layerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 rounded-[var(--radius)] border px-3 py-1.5 text-[13px] font-medium transition-colors',
          wrongChain && !passkey.wallet
            ? 'border-[color:var(--caution)]/40 bg-[color:var(--caution-dim)] text-[color:var(--caution)]'
            : 'border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] hover:bg-[color:var(--surface-hover)]',
        )}
      >
        {anyConnected ? (
          <>
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{
                background: passkey.wallet
                  ? 'var(--positive)'
                  : 'var(--caution)',
              }}
            />
            <span className="mono">{shortAddress(connectedAddress!)}</span>
          </>
        ) : (
          'Connect wallet'
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[21rem] max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] p-4 shadow-xl">
          {/*
            One balance leads, and everything else is a row.

            This panel used to open with two equal sections, five bordered
            buttons and about a hundred words of 10px explanation — the wallet
            explaining itself before answering the only question anyone opens
            it to ask, which is whether there is enough in it to hire with.
            That number is now the first thing in the panel and the largest
            thing in it. The explanations became the second line of the row
            they describe, where they are read in passing rather than instead.
          */}
          {/*
            Which wallet signs, said once, where the wallet is chosen.

            This was a toggle on the hire page, which was wrong twice: picking
            a wallet belongs where you connect one, and a hire should not ask a
            question it can answer. Connecting a browser wallet is already a
            deliberate act, so it decides — and the only thing left to do is
            say so plainly here, rather than leave someone to infer it from
            which address a signature prompt shows.
          */}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-[color:var(--text-faint)]">
              {active.mode === 'external'
                ? 'Hiring from your own wallet'
                : active.mode === 'passkey'
                  ? 'Hiring from your passkey wallet'
                  : isConnected
                    ? 'Your wallet, once it is on the right network'
                    : 'Wallet'}
            </span>
            {connectedAddress && (
              <span className="mono text-[11px] text-[color:var(--text-faint)]">
                {shortAddress(connectedAddress)}
              </span>
            )}
          </div>

          <Link
            href="/account"
            onClick={close}
            className="mt-3 flex items-center gap-3 rounded-[var(--radius)] bg-[color:var(--bg-subtle)] px-3 py-2.5 text-[12px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
          >
            <IdentityIcon />
            Account
            <span className="ml-auto text-[color:var(--text-faint)]" aria-hidden>→</span>
          </Link>

          {/*
            No view switcher here.
            
            This panel carried a copy of the Hiring / Building choice directly
            under its own link to Account, which is the page that asks the
            same question at length — and both workspaces already carry the
            toggle on the page itself. Three places to make one choice, one of
            them a menu you have to open first.
          */}

          {/*
            A connected browser wallet leads, wrong network included.

            This branched on whether the wallet could sign, so one pointed at
            another chain fell through to the passkey pitch — and somebody who
            had connected a wallet and only needed to switch network was shown
            "Hire without handing over a key" and two buttons for making a
            passkey they had not asked for. The problem they actually had was
            not on screen.
          */}
          {isConnected ? (
            <div className="mt-2 flex flex-col" aria-live="polite">
              {wrongChain ? (
                /*
                  The one thing standing between this wallet and a hire, said
                  as the thing it is rather than as an empty balance. Reading
                  "— $U · balances unavailable" is true and useless: the
                  account is fine, it is pointed at another chain.
                */
                <>
                  <span className="text-[10px] uppercase tracking-wide text-[color:var(--caution)]">
                    Wrong network
                  </span>
                  <span className="mt-1 font-[family-name:var(--font-serif)] text-[19px] leading-snug">
                    This wallet is on {chain?.name ?? 'another chain'}.
                  </span>
                  <span className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                    Escrow settles on {ESCROW_CHAIN.name}. Switch and this
                    wallet can hire — nothing else needs setting up.
                  </span>
                  <button
                    type="button"
                    onClick={() => switchChain({ chainId: ESCROW_CHAIN.id })}
                    disabled={switching}
                    className="action-primary mt-3 inline-flex min-h-9 w-fit items-center rounded-[var(--radius)] px-4 text-[12px] font-semibold disabled:opacity-50"
                  >
                    {switching
                      ? 'Waiting for your wallet…'
                      : `Switch to ${ESCROW_CHAIN.name}`}
                  </button>
                </>
              ) : (
                <>
              <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                Available to hire with
              </span>
              <span className="font-[family-name:var(--font-serif)] text-[28px] leading-tight tabular">
                {externalBalance.data
                  ? Number(formatUnits(externalBalance.data.payment, 18)).toFixed(2)
                  : '—'}{' '}
                $U
              </span>
              <span className="text-[11px] text-[color:var(--text-muted)]">
                {externalBalance.isPending
                  ? 'Reading balances…'
                  : externalBalance.isError || !externalBalance.data
                    ? 'Balances unavailable'
                    : `${Number(formatEther(externalBalance.data.native)).toFixed(4)} ${NATIVE_SYMBOL} for gas`}
                {PAYMENT_VALUE_NOTE ? ` · ${PAYMENT_VALUE_NOTE.toLowerCase()}` : ''}
              </span>
                </>
              )}

              {/*
                The same rows the passkey gets, pointed at this wallet.
                
                Connecting a browser wallet used to leave the panel with a
                balance and nothing else — no way to copy the address it had
                just shown, no way to disconnect, no route to the jobs it would
                create. The wallet that is signing is the one these act on.
              */}
              <div className="mt-3 flex flex-col border-t border-[color:var(--border)] pt-1">
                <WalletRow
                  icon={<IdentityIcon />}
                  accent="brand"
                  title="Your own wallet"
                  detail={
                    wrongChain
                      ? `${shortAddress(address!)} · switch network to hire`
                      : `${shortAddress(address!)} · signing hires`
                  }
                  tone={wrongChain ? 'caution' : undefined}
                />
                <WalletRow
                  icon={<EscrowIcon />}
                  accent="info"
                  title={copied ? 'Address copied' : 'Copy address'}
                  detail={
                    FAUCETS
                      ? 'Copy it, then claim test tokens to hire with'
                      : 'Copy it to top up before hiring'
                  }
                  onClick={async () => {
                    await navigator.clipboard.writeText(address!);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                />
                <WalletRow
                  icon={<GasIcon />}
                  title="Transactions"
                  detail="View all activity"
                  href="/activity"
                />
                {/*
                  The passkey does not disappear because another wallet is
                  connected — it steps back. Someone who created one here can
                  still see it and switch to it by disconnecting this.
                */}
                {passkey.wallet ? (
                  <WalletRow
                    icon={<SigningIcon />}
                  accent="positive"
                    title="Passkey wallet"
                    detail={`${shortAddress(passkey.wallet.address)} · standing by`}
                  />
                ) : passkey.supported ? (
                  /*
                    Offered, not pitched. Somebody who connected a wallet came
                    to use it; a passkey is a second way in and belongs in the
                    list with the others rather than as a headline they have to
                    read past.
                  */
                  <WalletRow
                    icon={<SigningIcon />}
                  accent="positive"
                    title="Passkey wallet"
                    detail={
                      passkey.busy === 'creating'
                        ? 'Waiting for prompt…'
                        : 'Optional · sign with fingerprint or face instead'
                    }
                    onClick={() => passkey.create()}
                  />
                ) : null}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 border-t border-[color:var(--border)] pt-3">
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="rounded-[var(--radius)] px-1 py-1 text-[13px] font-medium transition-colors hover:text-[color:var(--negative)]"
                >
                  {passkey.wallet
                    ? 'Disconnect and use passkey'
                    : 'Disconnect wallet'}
                </button>

              </div>
            </div>
          ) : passkey.wallet ? (
            <>
              <div className="mt-2 flex flex-col" aria-live="polite">
                <span className="text-[10px] uppercase tracking-wide text-[color:var(--text-faint)]">
                  Available to hire with
                </span>
                <span className="font-[family-name:var(--font-serif)] text-[28px] leading-tight tabular">
                  {paymentBalance?.ok
                    ? Number(
                        formatUnits(paymentBalance.raw, paymentBalance.decimals),
                      ).toFixed(2)
                    : '—'}{' '}
                  $U
                </span>
                {/*
                  The Figma prints a dollar estimate under the balance. On a
                  testnet that would be an invented number, so the honest
                  second line is the thing that actually gates a hire besides
                  the budget: whether there is gas to send the transaction.
                */}
                <span className="text-[11px] text-[color:var(--text-muted)]">
                  {balances.isPending
                    ? 'Reading balances…'
                    : balances.isError
                      ? 'Balances unavailable'
                      : `${Number(formatEther(balances.data!.native)).toFixed(4)} ${NATIVE_SYMBOL} for gas`}
                  {PAYMENT_VALUE_NOTE ? ` · ${PAYMENT_VALUE_NOTE.toLowerCase()}` : ''}
                </span>
              </div>

              <div className="mt-3 flex flex-col border-t border-[color:var(--border)] pt-1">
                <WalletRow
                  icon={<SigningIcon />}
                  accent="positive"
                  title="Passkey wallet"
                  detail="Signing hires · key held in this device"
                />
                <WalletRow
                  icon={<IdentityIcon />}
                  accent="brand"
                  title="Your own wallet"
                  detail={
                    switching
                      ? `Switching to ${ESCROW_CHAIN.name}…`
                      : isPending
                        ? 'Waiting for your wallet…'
                        : isConnected
                          ? wrongChain
                            ? `${chain?.name ?? 'Wrong network'} — switch to ${ESCROW_CHAIN.name}`
                            : `${shortAddress(address!)} · signing hires`
                          : 'Connect to hire from it instead'
                  }
                  tone={wrongChain ? 'caution' : undefined}
                  onClick={
                    wrongChain
                      ? () => switchChain({ chainId: ESCROW_CHAIN.id })
                      : isConnected
                        ? () => disconnect()
                        : primaryConnector
                          ? () => connect({ connector: primaryConnector })
                          : undefined
                  }
                />
                <WalletRow
                  icon={<EscrowIcon />}
                  accent="info"
                  title={copied ? 'Address copied' : 'Copy address'}
                  detail={
                    FAUCETS
                      ? 'Paste it where you claim test tokens'
                      : 'Paste it wherever you top this wallet up'
                  }
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      active.address ?? passkey.wallet!.address,
                    );
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                />
                {/*
                  Sending, for the wallet that can. The panel reported what
                  a passkey held and offered no way to move it, which makes
                  it somewhere funds arrive and do not leave.
                */}
                {/*
                  The faucet, where emptiness is discovered.

                  This was a link to the BNB testnet faucet page, which
                  gates on the address having mainnet history — so for a
                  passkey minted minutes ago it is a dead end that looks
                  like a way out. The bot answers a message instead, and
                  the message is written here with the address already in
                  it.
                */}
                {/*
                  Known to be empty, not merely unmeasured. Defaulting the
                  balance to zero while the request is in flight would show
                  a faucet to somebody who is already funded.
                */}
                {FAUCETS?.paymentTokenBot && balances.isSuccess && balances.data?.native !== undefined && balances.data.native < GAS_RESERVE && (
                  <LowBalanceHelp address={passkey.wallet!.address} />
                )}
                {passkey.wallet && passkeySigner && (
                  <SendTokens
                    wallet={{ address: passkey.wallet.address }}
                    signer={passkeySigner}
                    nativeBalance={balances.data?.native ?? 0n}
                    paymentBalance={paymentBalance?.ok ? paymentBalance.raw : 0n}
                    onSent={() => void balances.refetch()}
                  />
                )}
                <WalletRow
                  icon={<GasIcon />}
                  title="Transactions"
                  detail="View all activity"
                  href="/activity"
                />
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 border-t border-[color:var(--border)] pt-3">
                <button
                  type="button"
                  onClick={() => {
                    passkey.forget();
                    setOpen(false);
                  }}
                  className="rounded-[var(--radius)] px-1 py-1 text-[13px] font-medium transition-colors hover:text-[color:var(--negative)]"
                >
                  Forget on this device
                </button>

              </div>
            </>
          ) : (
            <>
              {/*
                The wallet leads; the passkey is the fallback.

                These were the other way round, because for a while a passkey
                was the only thing that could sign a hire. Two things changed.
                A browser wallet can fund an escrow now, so the passkey is no
                longer load-bearing. And a passkey is bound to the domain that
                made it, so the address it mints exists on Pokter and nowhere
                else — which is a quiet trap for anybody building a record
                that has to be legible somewhere other than here.

                So the default is the wallet somebody already has and can
                carry off this site. The passkey is still a genuine way in,
                offered below for people who have no wallet at all, with the
                one thing about it that can cost them stated plainly.
              */}
              <p className="mt-2 font-[family-name:var(--font-serif)] text-[19px] leading-snug">
                Hire with the wallet you already have.
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                The same address you use everywhere else, so the record you
                build here is yours to take anywhere. Pokter never holds a key.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isPending || !primaryConnector}
                  onClick={primaryConnector ? () => connect({ connector: primaryConnector }) : undefined}
                  className="rounded-[var(--radius)] bg-[color:var(--text)] px-3 py-2 text-[12px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {isPending
                    ? 'Waiting for your wallet…'
                    : injected
                      ? 'Connect wallet'
                      : 'Scan with your wallet app'}
                </button>
                {injected && walletConnectConnector && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => connect({ connector: walletConnectConnector })}
                    className="rounded-[var(--radius)] border border-[color:var(--border)] px-3 py-2 text-[12px] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
                  >
                    Use a phone wallet
                  </button>
                )}
              </div>
              {!primaryConnector && (
                <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                  No browser wallet found. Install one, or use a passkey below.
                </p>
              )}
              {!injected && walletConnectConnector && (
                <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                  Opens a QR code for MetaMask, Trust or any WalletConnect wallet.
                </p>
              )}

              <div className="mt-3 border-t border-[color:var(--border)] pt-3">
                <p className="text-[12px] font-medium">No wallet? Sign with a passkey</p>
                {!passkey.ready ? (
                  <p className="mt-1 text-[12px] text-[color:var(--text-faint)]">Checking…</p>
                ) : !passkey.supported ? (
                  <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                    This browser cannot use passkeys. They need WebAuthn over a
                    secure connection.
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                      A key made in this device, so signing asks for your
                      fingerprint or face. It only works on Pokter — if you are
                      entering Set and Earn, connect a wallet instead.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={passkey.busy !== null}
                        onClick={() => passkey.create()}
                        className="rounded-[var(--radius)] border border-[color:var(--border)] px-3 py-2 text-[12px] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
                      >
                        {passkey.busy === 'creating'
                          ? 'Waiting for prompt…'
                          : 'Create passkey wallet'}
                      </button>
                      <button
                        type="button"
                        disabled={passkey.busy !== null}
                        onClick={() => passkey.recover()}
                        className="rounded-[var(--radius)] border border-[color:var(--border)] px-3 py-2 text-[12px] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
                      >
                        {passkey.busy === 'recovering' ? 'Waiting…' : 'Use existing'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/*
            A connect that throws used to show nothing at all.
            WalletConnect loads its provider lazily, so a missing dependency
            or an unreachable relay fails at the click rather than at build:
            the button depresses, nothing opens, and the panel sits there
            looking fine. Whatever the cause, the reader gets told.
          */}
          {connectError && (
            <p className="mt-3 text-[12px] leading-relaxed text-[color:var(--negative)]">
              {walletActionError(connectError, 'Connecting')}
            </p>
          )}

          {passkey.error && (
            <p className="mt-3 text-[12px] leading-relaxed text-[color:var(--negative)]">
              {passkey.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
