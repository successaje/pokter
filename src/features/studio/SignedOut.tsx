import { LinkButton } from '@/ui/Button';
import { EmptyState } from '@/ui/Feedback';

/** A Building page asked for before the builder has verified their wallet. */
export function BuildingSignedOut({ what }: { what: string }) {
  return (
    <EmptyState title={`Verify your wallet to see ${what}`} action={<LinkButton href="/build/import">Verify to manage</LinkButton>}>
      Building pages show what a wallet owns, so Pokter asks it to sign once first. Signing moves no funds.
    </EmptyState>
  );
}
