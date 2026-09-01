'use client';

import { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';

import { cn } from '@/lib/ui/cn';
import { shortAddress } from '@/lib/ui/format';
import { ESCROW_CHAIN } from '@/lib/wallet/config';
import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';

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

  const passkey = usePasskeyWallet();
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  const injected = connectors.find((c) => c.id === 'injected') ?? connectors[0];
  const wrongChain = isConnected && chain?.id !== ESCROW_CHAIN.id;
  const connectedAddress = passkey.wallet?.address ?? address;
  const anyConnected = Boolean(connectedAddress);

  return (
    <div className="relative">
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
                background: passkey.wallet ? 'var(--positive)' : 'var(--caution)',
              }}
            />
            <span className="mono">{shortAddress(connectedAddress!)}</span>
          </>
        ) : (
          'Connect wallet'
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] p-3 shadow-xl">
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-medium">Passkey wallet</h3>
              <span className="text-[9px] uppercase tracking-wide text-[color:var(--positive)]">
                can sign
              </span>
            </div>

            {passkey.wallet ? (
              <>
                <p className="mono text-[11px]">{shortAddress(passkey.wallet.address)}</p>
                <p className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
                  Key held in this device&apos;s secure enclave. Pokter cannot
                  sign for you.
                </p>
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
              <p className="text-[10px] text-[color:var(--text-faint)]">Checking…</p>
            ) : !passkey.supported ? (
              <p className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
                This browser cannot use passkeys. They need WebAuthn over a
                secure connection.
              </p>
            ) : (
              <>
                <p className="text-[10px] leading-relaxed text-[color:var(--text-faint)]">
                  Creates a wallet whose only key lives in your device. Signing
                  asks for your fingerprint or face.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={passkey.busy !== null}
                    onClick={() => passkey.create()}
                    className="rounded-[var(--radius)] bg-[color:var(--text)] px-2.5 py-1.5 text-[11px] font-medium text-[color:var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {passkey.busy === 'creating' ? 'Waiting for prompt…' : 'Create passkey wallet'}
                  </button>
                  <button
                    type="button"
                    disabled={passkey.busy !== null}
                    onClick={() => passkey.recover()}
                    className="rounded-[var(--radius)] border border-[color:var(--border)] px-2.5 py-1.5 text-[11px] transition-colors hover:bg-[color:var(--surface-hover)] disabled:opacity-50"
                  >
                    {passkey.busy === 'recovering' ? 'Waiting…' : 'Use existing'}
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
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-medium">Browser wallet</h3>
              <span className="text-[9px] uppercase tracking-wide text-[color:var(--text-faint)]">
                identity only
              </span>
            </div>

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
                    {switching ? 'Switching…' : `Switch to ${ESCROW_CHAIN.name}`}
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
