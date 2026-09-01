'use client';

import { useAccount } from 'wagmi';

import { ESCROW_CHAIN } from '@/lib/wallet/config';
import { usePasskeyWallet } from '@/components/wallet/PasskeyProvider';

/**
 * Gates the steps that commit something.
 *
 * Browsing stays public (§59). Either wallet unlocks the step, but they are not
 * equivalent and the copy does not pretend otherwise: a passkey wallet signs
 * the grant itself, while a browser wallet only identifies the user and leaves
 * signing to Pokter's operator key.
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

  if (!unlocked) {
    return (
      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] p-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Connect a wallet to {action}</p>
          <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
            Discovery, evidence and rankings stay public. A wallet is only needed
            once you are about to commit something.
          </p>
        </div>
        <p className="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
          Use <span className="font-medium">Connect wallet</span> in the header.
          A passkey wallet keeps the signing key on this device; a browser wallet
          identifies you but cannot sign an Altana session.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {wrongChain && (
        <p className="rounded-[var(--radius)] border border-[color:var(--caution)]/35 bg-[color:var(--caution-dim)] p-3 text-[11px] leading-relaxed text-[color:var(--caution)]">
          Your wallet is on {chain?.name ?? 'another network'}, but Pokter acts on{' '}
          {ESCROW_CHAIN.name}. Switch networks from the wallet menu before
          continuing.
        </p>
      )}
      {children}
    </div>
  );
}
