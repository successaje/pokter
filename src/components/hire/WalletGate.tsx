'use client';

import { createContext, useContext } from 'react';
import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { useWalletMode } from '@/lib/wallet/mode';
import { useExternalAccount } from '@/lib/wallet/useExternalAccount';

/**
 * Whether the committing action is available, and why not when it isn't.
 *
 * Read by the panels so they can disable their own submit button while still
 * rendering everything above it.
 */
const LockContext = createContext<{ locked: boolean; reason: string | null }>({
  locked: false,
  reason: null,
});

export function useCommitLock() {
  return useContext(LockContext);
}

/**
 * Gates the *action*, not the explanation.
 *
 * This used to replace its children with a connect prompt, which meant the
 * permission review — the single most important screen here — was invisible to
 * anyone without a wallet, on a page whose own subtitle promises you can review
 * what an agent would be allowed to do *before* granting anything. Someone
 * evaluating the product should be able to read every constraint without
 * committing to anything, so the panels now render for everyone and only the
 * button that signs is held back.
 *
 * Browsing stays public (§59). A passkey can sign its own Altana session. An
 * injected browser wallet is identity-only until Pokter has a verified signer
 * integration for it. Passkey wallets sign both session grants and escrow
 * funding on-device.
 */
export function WalletGate({
  action,
  capability,
  children,
}: {
  action: string;
  capability: 'session' | 'commission';
  children: React.ReactNode;
}) {
  const passkey = usePasskeyWallet();
  const mode = useWalletMode();
  const external = useExternalAccount();

  /*
   * Either wallet can fund an escrow now, so the gate asks which one is
   * selected rather than assuming a passkey.
   *
   * Sessions are still passkey-only, and that is not a gap to close: granting
   * one needs the two signatures an injected wallet refuses, which is correct
   * behaviour on the wallet's part rather than a missing feature. A commission
   * needs neither.
   */
  const ready =
    capability === 'session'
      ? Boolean(passkey.wallet)
      : mode === 'external'
        ? Boolean(external)
        : Boolean(passkey.wallet);

  const reason = ready
    ? null
    : capability === 'session'
      ? `Create or connect a passkey wallet to ${action}.`
      : mode === 'external'
        ? `Connect your browser wallet to ${action}.`
        : `Create or connect a passkey wallet to ${action}.`;

  return (
    <LockContext.Provider value={{ locked: reason !== null, reason }}>
      <div className="flex flex-col gap-3">
        {reason && (
          capability === 'commission' ? (
            <div className="flex items-center gap-3 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--bg-subtle)] px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-highlight-soft)] text-[color:var(--brand)]" aria-hidden>⌁</span>
              <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                Configure and review first. You only need a passkey wallet when you are ready to fund.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 rounded-[var(--radius)] border border-dashed border-[color:var(--border-strong)] p-4">
              <p className="text-[12px] font-medium">
                Everything below is yours to read before you connect anything.
              </p>
              <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                <>
                  Discovery, evidence and this permission review stay public.
                  Use <span className="font-medium">Connect wallet</span> in the
                  header and choose a passkey to sign on this device. A browser
                  wallet can fund an escrow but cannot authorize a session — a
                  grant needs two signatures injected wallets refuse, which is
                  the wallet protecting you rather than a feature we skipped.
                </>
              </p>
            </div>
          )
        )}

        {children}
      </div>
    </LockContext.Provider>
  );
}
