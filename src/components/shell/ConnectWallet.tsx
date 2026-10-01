'use client';

import { FAUCETS, NATIVE_SYMBOL, PAYMENT_VALUE_NOTE } from '@/lib/network/presentation';
import { useQuery } from '@tanstack/react-query';
import { formatEther, formatUnits } from 'viem';
import { useCallback, useState, type ReactNode } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { ESCROW_CHAIN } from '@/lib/wallet/config';
import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { useActiveWallet } from '@/lib/wallet/active';
import { useDismissibleLayer } from '@/lib/ui/useDismissibleLayer';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';
import { externalBalances } from '@/lib/wallet/external';

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

function WorkspaceIcon({ builder = false }: { builder?: boolean }) {
  return builder ? (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="M4 8.5 12 4l8 4.5v9L12 22l-8-4.5v-9Z" />
      <path d="m4 8.5 8 4.5 8-4.5M12 13v9" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-none stroke-current" strokeWidth="1.8">
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </svg>
  );
}

function WorkspaceSwitcher({
  builderOwner,
  builderSessionPending,
  current,
  onNavigate,
}: {
  builderOwner?: string;
  builderSessionPending: boolean;
  current: 'personal' | 'builder';
  onNavigate: () => void;
}) {
  return (
    <section className="mt-3 border-y border-[color:var(--border)] py-3" aria-label="Workspace">
      <p className="px-1 text-[9px] font-medium uppercase tracking-[0.16em] text-[color:var(--text-faint)]">
        Workspace
      </p>
      <div className="mt-2 grid gap-1">
        <Link
          href="/app"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 rounded-[var(--radius)] px-2.5 py-2 text-left transition-colors',
            current === 'personal'
              ? 'bg-[color:var(--surface-hover)] text-[color:var(--text)]'
              : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]',
          )}
        >
          <WorkspaceIcon />
          <span className="text-[12px] font-medium">Personal</span>
          {current === 'personal' && <span className="ml-auto text-[color:var(--positive)]" aria-label="Current workspace">✓</span>}
        </Link>

        {builderOwner ? (
          <Link
            href="/builder"
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-[var(--radius)] px-2.5 py-2 text-left transition-colors',
              current === 'builder'
                ? 'bg-[color:var(--surface-hover)] text-[color:var(--text)]'
                : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]',
            )}
          >
            <WorkspaceIcon builder />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium">Builder</span>
              <span className="mono block truncate text-[9px] text-[color:var(--text-faint)]">Verified {shortAddress(builderOwner)}</span>
            </span>
            {current === 'builder' && <span className="text-[color:var(--positive)]" aria-label="Current workspace">✓</span>}
          </Link>
        ) : builderSessionPending ? (
          <div className="flex items-center gap-3 rounded-[var(--radius)] px-2.5 py-2 text-[color:var(--text-muted)]">
            <WorkspaceIcon builder />
            <span className="text-[12px] font-medium">Checking builder access…</span>
          </div>
        ) : (
          <Link
            href="/build"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-[var(--radius)] px-2.5 py-2 text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]"
          >
            <WorkspaceIcon builder />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium">Become a builder</span>
              <span className="block truncate text-[9px] text-[color:var(--text-faint)]">Verify an ERC-8004 agent you own</span>
            </span>
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </section>
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
}: {
  icon: ReactNode;
  title: string;
  detail: ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: 'caution';
}) {
  const body = (
    <>
      <span
        className={cn(
          'shrink-0',
          tone === 'caution'
            ? 'text-[color:var(--caution)]'
            : 'text-[color:var(--text-faint)]',
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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const layerRef = useDismissibleLayer<HTMLDivElement>({
    open,
    onDismiss: close,
  });

  const passkey = usePasskeyWallet();
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
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  const injected = connectors.find((c) => c.id === 'injected') ?? connectors[0];
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
  const builderSession = useQuery<{ authenticated: boolean; owner?: string }>({
    queryKey: ['builder-session'],
    queryFn: async () => {
      const response = await fetch('/api/builders/session', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Builder session could not be read.');
      return response.json() as Promise<{ authenticated: boolean; owner?: string }>;
    },
    enabled: open,
    staleTime: 30_000,
  });
  const currentWorkspace = pathname === '/builder' ? 'builder' : 'personal';

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

          <WorkspaceSwitcher
            builderOwner={builderSession.data?.authenticated ? builderSession.data.owner : undefined}
            builderSessionPending={builderSession.isPending}
            current={currentWorkspace}
            onNavigate={close}
          />

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
                  href="/my-agents"
                />
                {/*
                  The passkey does not disappear because another wallet is
                  connected — it steps back. Someone who created one here can
                  still see it and switch to it by disconnecting this.
                */}
                {passkey.wallet ? (
                  <WalletRow
                    icon={<SigningIcon />}
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
                {FAUCETS && (
                  <a
                    href={FAUCETS.native}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[11px] text-[color:var(--text-faint)] underline-offset-2 hover:underline"
                  >
                    Faucet ↗
                  </a>
                )}
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
                  title="Passkey wallet"
                  detail="Signing hires · key held in this device"
                />
                <WalletRow
                  icon={<IdentityIcon />}
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
                        : injected
                          ? () => connect({ connector: injected })
                          : undefined
                  }
                />
                <WalletRow
                  icon={<EscrowIcon />}
                  title={copied ? 'Address copied' : 'Add funds'}
                  detail={
                    FAUCETS
                      ? 'Copy the address, then claim test tokens'
                      : 'Copy this address to top up escrow'
                  }
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      active.address ?? passkey.wallet!.address,
                    );
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                />
                <WalletRow
                  icon={<GasIcon />}
                  title="Transactions"
                  detail="View all activity"
                  href="/my-agents"
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
                {FAUCETS && (
                  <a
                    href={FAUCETS.native}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[11px] text-[color:var(--text-faint)] underline-offset-2 hover:underline"
                  >
                    Faucet ↗
                  </a>
                )}
              </div>
            </>
          ) : !passkey.ready ? (
            <p className="mt-3 text-[12px] text-[color:var(--text-faint)]">
              Checking…
            </p>
          ) : !passkey.supported ? (
            <p className="mt-3 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
              This browser cannot use passkeys. They need WebAuthn over a secure
              connection.
            </p>
          ) : (
            <>
              {/*
                Nothing to weigh up here, so nothing is presented as a choice.
                A passkey wallet is the only one that can sign a hire; the
                browser wallet is an extra, and it sits below as a row rather
                than beside this as an equal.
              */}
              <p className="mt-2 font-[family-name:var(--font-serif)] text-[19px] leading-snug">
                Hire without handing over a key.
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
                The key is made in this device and stays there, so signing asks
                for your fingerprint or face and Pokter never holds it.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={passkey.busy !== null}
                  onClick={() => passkey.create()}
                  className="rounded-[var(--radius)] bg-[color:var(--text)] px-3 py-2 text-[12px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
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
              <div className="mt-3 flex flex-col border-t border-[color:var(--border)] pt-1">
                {/*
                  An equal way in, not a lesser one.

                  This offered the browser wallet as something that recognises
                  you but cannot sign a hire. That was true when only a passkey
                  could fund an escrow and stopped being true when this one
                  could — leaving the panel talking somebody out of a wallet
                  they already have and can hire with today.
                */}
                <WalletRow
                  icon={<IdentityIcon />}
                  title={isConnected ? 'Your own wallet' : 'Use my own wallet'}
                  detail={
                    isPending
                      ? 'Waiting for your wallet…'
                      : isConnected
                        ? `${shortAddress(address!)} · ${chain?.name ?? 'connected'}`
                        : 'Hire from the wallet you already have'
                  }
                  onClick={
                    isConnected
                      ? () => disconnect()
                      : injected
                        ? () => connect({ connector: injected })
                        : undefined
                  }
                />
              </div>
            </>
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
