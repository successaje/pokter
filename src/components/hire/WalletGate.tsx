'use client';

import { createContext, useContext } from 'react';
import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';

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
  const selfCustody = Boolean(passkey.wallet);
  const reason = selfCustody
    ? null
    : `Create or connect a passkey wallet to ${action}.`;

  return (
    <LockContext.Provider value={{ locked: reason !== null, reason }}>
      <div className="flex flex-col gap-3">
        {reason && (
          <div className="flex flex-col gap-1 rounded-[var(--radius)] border border-dashed border-[color:var(--border-strong)] p-4">
            <p className="text-[12px] font-medium">
              Everything below is yours to read before you connect anything.
            </p>
            <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
              {capability === 'session' ? (
                <>
                  Discovery, evidence and this permission review stay public.
                  Use <span className="font-medium">Connect wallet</span> in the
                  header and choose a passkey to sign on this device. Browser
                  wallets are identity-only here and cannot authorize a session.
                </>
              ) : (
                <>
                  You can review the provider, task and budget before connecting.
                  A passkey wallet signs and funds the escrow itself; Pokter
                  never substitutes its operator key.
                </>
              )}
            </p>
          </div>
        )}

        {children}
      </div>
    </LockContext.Provider>
  );
}
