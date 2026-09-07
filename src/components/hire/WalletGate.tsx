'use client';

import { createContext, useContext } from 'react';
import { useAccount } from 'wagmi';

import { ESCROW_CHAIN } from '@/lib/wallet/config';
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
 * Browsing stays public (§59). The two wallets are not equivalent and the copy
 * does not pretend otherwise: a passkey signs the grant itself, while a browser
 * wallet only identifies the user and leaves signing to Pokter's operator key.
 */
export function WalletGate({
  action,
  children,
}: {
  action: string;
  children: React.ReactNode;
}) {
  const passkey = usePasskeyWallet();
  const { isConnected, chain } = useAccount();

  const selfCustody = Boolean(passkey.wallet);
  const unlocked = selfCustody || isConnected;
  const wrongChain = !selfCustody && isConnected && chain?.id !== ESCROW_CHAIN.id;

  const reason = !unlocked
    ? `Connect a wallet to ${action}.`
    : wrongChain
      ? `Your wallet is on ${chain?.name ?? 'another network'}, but Pokter acts on ${ESCROW_CHAIN.name}.`
      : null;

  return (
    <LockContext.Provider value={{ locked: reason !== null, reason }}>
      <div className="flex flex-col gap-3">
        {!unlocked && (
          <div className="flex flex-col gap-1 rounded-[var(--radius)] border border-dashed border-[color:var(--border-strong)] p-4">
            <p className="text-[12px] font-medium">
              Everything below is yours to read before you connect anything.
            </p>
            <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
              Discovery, evidence and rankings stay public, and so does this
              review. A wallet is only needed for the final step that commits.
              Use <span className="font-medium">Connect wallet</span> in the
              header — a passkey keeps the signing key on this device, while a
              browser wallet identifies you but cannot sign an Altana session.
            </p>
          </div>
        )}

        {wrongChain && (
          <p className="rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-3 text-[11px] leading-relaxed text-[color:var(--caution)]">
            Your wallet is on {chain?.name ?? 'another network'}, but Pokter acts
            on {ESCROW_CHAIN.name}. Switch networks from the wallet menu before
            continuing.
          </p>
        )}

        {children}
      </div>
    </LockContext.Provider>
  );
}
