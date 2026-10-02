'use client';

import { createContext, useContext } from 'react';
import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';
import { ESCROW_CHAIN } from '@/lib/wallet/config';
import { useActiveWallet } from '@/lib/wallet/active';

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
 * Browsing stays public (§59). Either wallet funds an escrow: a passkey
 * signs on-device, and an injected browser wallet signs the ordinary
 * ERC-8183 calls itself. The older note here said browser wallets were
 * identity-only, which stopped being true when the direct hire path landed.
 *
 * Only a session grant is passkey-bound, because it needs two signatures an
 * injected wallet refuses — and sessions are paused anyway, so no surface
 * currently asks for one.
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
  const active = useActiveWallet();

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
    capability === 'session' ? Boolean(passkey.wallet) : active.mode !== null;

  const reason = ready
    ? null
    : capability === 'session'
      ? `Create or connect a passkey wallet to ${action}.`
      : active.wrongChain
        ? `Switch your wallet to ${ESCROW_CHAIN.name} to ${action}.`
        : `Connect a wallet to ${action}.`;

  return (
    <LockContext.Provider value={{ locked: reason !== null, reason }}>
      <div className="flex flex-col gap-3">
        {reason && (
          /*
             Nothing is said on the commission path any more.

             It carried a notice explaining that a wallet is only needed at the
             funding step — which the page already demonstrates by letting
             someone configure the whole job first, and which the button states
             itself when it is disabled. A line explaining a thing the reader
             can already see is a line they read instead of the job.
          */
          capability === 'commission' ? null : (
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
