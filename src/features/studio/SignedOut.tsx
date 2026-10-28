import { EmptyState } from '@/ui/Feedback';

import { VerifyOwner } from './VerifyOwner';

/**
 * A Building page asked for before the builder has verified their wallet.
 * Verifying happens here and reloads this page, rather than sending the
 * builder to Import and leaving them on an agent's page afterwards.
 */
export function BuildingSignedOut({ what }: { what: string }) {
  return (
    <EmptyState title={`Verify your wallet to see ${what}`} action={<VerifyOwner />}>
      Building pages show what a wallet owns, so they open once Pokter knows the wallet is yours.
    </EmptyState>
  );
}
