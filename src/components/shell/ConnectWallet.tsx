'use client';

import { FAUCETS, NATIVE_SYMBOL } from '@/lib/network/presentation';
import { useQuery } from '@tanstack/react-query';
import { formatEther, formatUnits } from 'viem';
import { useCallback, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';

import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { ESCROW_CHAIN } from '@/lib/wallet/config';
import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { useDismissibleLayer } from '@/lib/ui/useDismissibleLayer';
import { correctedErc8183Addresses } from '@/lib/erc8183/addresses';
import { WALLET_NETWORK, walletClient } from '@/lib/wallet/passkey';

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
  const connectedAddress = passkey.wallet?.address ?? address;
  const anyConnected = Boolean(connectedAddress);

  return (
    <div ref={layerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          'flex min-h-11 items-center gap-2 rounded-[var(--radius)] border px-3 py-1.5 text-[13px] font-medium transition-colors md:min-h-0',
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
        <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] p-3 shadow-xl">
          {/*
            Two wallets, named by the job each one does.

            This used to read "Passkey wallet / can sign" above "Browser
            wallet / identity only" — technology first, with the second
            defined by what it lacks. A visitor with MetaMask installed was
            told what they could not do before being told what anything was
            for. Naming the roles puts the question the right way round: what
            do you want to happen, and which wallet does it.
          */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-medium">
                <SigningIcon />
                Signs and pays
              </h3>
              <span className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">
                passkey
              </span>
            </div>

            {passkey.wallet ? (
              <>
                <p className="mono text-[11px]">
                  {shortAddress(passkey.wallet.address)}
                </p>
                <p className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
                  Key held in this device&apos;s secure enclave. Pokter cannot
                  sign for you.
                </p>
                <div className="grid grid-cols-2 gap-2" aria-live="polite">
                  <div className="flex min-w-0 items-center gap-2 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-2.5">
                    <span className="text-[color:var(--brand)]">
                      <GasIcon />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">
                        Gas
                      </span>
                      <span className="tabular truncate text-[11px]">
                        {balances.data
                          ? Number(formatEther(balances.data.native)).toFixed(4)
                          : '—'}{' '}
                        {NATIVE_SYMBOL}
                      </span>
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] p-2.5">
                    <span className="text-[color:var(--brand)]">
                      <EscrowIcon />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">
                        Escrow
                      </span>
                      <span className="tabular truncate text-[11px]">
                        {paymentBalance?.ok
                          ? Number(
                              formatUnits(
                                paymentBalance.raw,
                                paymentBalance.decimals,
                              ),
                            ).toFixed(2)
                          : '—'}{' '}
                        $U
                      </span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px] text-[color:var(--text-faint)]">
                  <span>
                    {balances.isPending
                      ? 'Reading balances…'
                      : balances.isError
                        ? 'Balance unavailable'
                        : `Hiring funds · chain ${WALLET_NETWORK.chainId}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => balances.refetch()}
                    disabled={balances.isFetching}
                    aria-label="Refresh wallet balances"
                    className="rounded-[var(--radius)] border border-[color:var(--border)] px-2 py-1 transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
                  >
                    <span aria-hidden>↻</span>{' '}
                    {balances.isFetching ? 'Checking' : 'Refresh'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        passkey.wallet!.address,
                      );
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    }}
                    className="w-fit rounded-[var(--radius)] border border-[color:var(--border)] px-2.5 py-1 text-[11px] transition-colors hover:bg-[color:var(--surface-hover)]"
                  >
                    {copied ? 'Address copied' : 'Copy funding address'}
                  </button>
                  {FAUCETS && (
                    <a
                      href={FAUCETS.native}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="w-fit rounded-[var(--radius)] border border-[color:var(--border)] px-2.5 py-1 text-[11px] transition-colors hover:bg-[color:var(--surface-hover)]"
                    >
                      Get testnet {NATIVE_SYMBOL} ↗
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    passkey.forget();
                    setOpen(false);
                  }}
                  className="w-fit rounded-[var(--radius)] border border-[color:var(--border)] px-2.5 py-1 text-[11px] transition-colors hover:bg-[color:var(--surface-hover)]"
                >
                  Forget on this device
                </button>
              </>
            ) : !passkey.ready ? (
              <p className="text-[10px] text-[color:var(--text-faint)]">
                Checking…
              </p>
            ) : !passkey.supported ? (
              <p className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
                This browser cannot use passkeys. They need WebAuthn over a
                secure connection.
              </p>
            ) : (
              <>
                <p className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
                  Grants sessions and funds escrow. The only key lives in this
                  device, so signing asks for your fingerprint or face and
                  Pokter never holds it.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={passkey.busy !== null}
                    onClick={() => passkey.create()}
                    className="rounded-[var(--radius)] bg-[color:var(--text)] px-2.5 py-1.5 text-[11px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {passkey.busy === 'creating'
                      ? 'Waiting for prompt…'
                      : 'Create passkey wallet'}
                  </button>
                  <button
                    type="button"
                    disabled={passkey.busy !== null}
                    onClick={() => passkey.recover()}
                    className="rounded-[var(--radius)] border border-[color:var(--border)] px-2.5 py-1.5 text-[11px] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
                  >
                    {passkey.busy === 'recovering'
                      ? 'Waiting…'
                      : 'Use existing'}
                  </button>
                </div>
              </>
            )}

            {passkey.error && (
              <p className="text-[10px] leading-relaxed text-[color:var(--negative)]">
                {passkey.error}
              </p>
            )}
          </section>

          <section className="mt-3 flex flex-col gap-2 border-t border-[color:var(--border)] pt-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-medium">
                <IdentityIcon />
                Identifies you
              </h3>
              <span className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">
                browser wallet
              </span>
            </div>
            <p className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
              Recognises you across visits. It cannot sign here — an Altana
              wallet is an EIP-7702 account, and extension wallets withhold the
              signature one needs.
            </p>

            {isConnected ? (
              <>
                <p className="mono text-[11px]">{shortAddress(address!)}</p>
                <p className="text-[10px] text-[color:var(--text-faint)]">
                  {chain?.name ?? 'unknown network'}
                </p>
                {wrongChain && (
                  <button
                    type="button"
                    disabled={switching}
                    onClick={() => switchChain({ chainId: ESCROW_CHAIN.id })}
                    className="w-fit rounded-[var(--radius)] border border-[color:var(--caution)]/40 px-2.5 py-1 text-[11px] text-[color:var(--caution)] transition-colors hover:bg-[color:var(--caution-dim)] disabled:opacity-50"
                  >
                    {switching
                      ? 'Switching…'
                      : `Switch to ${ESCROW_CHAIN.name}`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="w-fit rounded-[var(--radius)] border border-[color:var(--border)] px-2.5 py-1 text-[11px] transition-colors hover:bg-[color:var(--surface-hover)]"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <>
                <p className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
                  Identifies you and switches networks. Cannot sign an Altana
                  session — the SDK has no injected signer yet.
                </p>
                <button
                  type="button"
                  disabled={isPending || !injected}
                  onClick={() => injected && connect({ connector: injected })}
                  className="w-fit rounded-[var(--radius)] border border-[color:var(--border-strong)] px-2.5 py-1.5 text-[11px] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
                >
                  {isPending ? 'Connecting…' : 'Connect browser wallet'}
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
