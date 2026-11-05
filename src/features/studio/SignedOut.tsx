import { EmptyState } from '@/ui/Feedback';

import { VerifyOwner } from './VerifyOwner';

/**
 * A Building page asked for before the builder has verified their wallet.
 * Verifying happens here and reloads this page, rather than sending the
 * builder to Import and leaving them on an agent's page afterwards.
 */
export function BuildingSignedOut({ what, serviceSetup = false }: { what: string; serviceSetup?: boolean }) {
  return (
    <EmptyState title={serviceSetup ? 'Set up service publishing' : `Verify your wallet to see ${what}`} action={<VerifyOwner />}>
      {serviceSetup
        ? 'A service needs an agent registered to your wallet. Once you have one, verify ownership here to publish its offer.'
        : 'Building pages show what a wallet owns, so they open once Pokter knows the wallet is yours.'}
    </EmptyState>
  );
}
