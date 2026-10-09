'use client';

import Link from 'next/link';

import { isCampaignLive } from '@/lib/campaign/window';
import { useHydrated } from '@/lib/ui/use-hydrated';
import { Callout } from '@/components/ui/Callout';

/**
 * Why a passkey is the wrong wallet for a Set and Earn hire.
 *
 * A passkey is bound to the domain that created it — `passkeyRpId()` returns
 * `window.location.hostname` — so the wallet behind a Pokter passkey exists
 * on Pokter and nowhere else. That is the right trade for an ordinary hire:
 * no extension, no seed phrase, one touch to sign.
 *
 * It is the wrong trade during the campaign. The rules want every qualifying
 * action to come from one registered wallet, and they want hires on more than
 * one marketplace. A passkey address cannot appear on the second one, so a
 * participant who hires here with a passkey either loses the hire from their
 * record or ends up operating two wallets — and the rules disqualify for the
 * second rather than merging the two.
 *
 * Saying so costs Pokter its smoothest path through the hire flow, during the
 * campaign it most wants hires in. It is still the only honest thing to show
 * someone about to spend an entry on it. Warning only: it never blocks
 * funding, because plenty of people hiring here are not in the campaign.
 */
export function CampaignWalletNote({ mode }: { mode: string | null }) {
  const hydrated = useHydrated();
  if (!hydrated || mode !== 'passkey' || !isCampaignLive()) return null;

  return (
    <Callout tone="caution" title="Hiring for Set and Earn? Use your own wallet">
      <p>
        A passkey only works on the domain that made it, so this address exists on Pokter and cannot
        be reused on another marketplace. The campaign counts actions from one registered wallet and
        asks for hires on more than one marketplace — and it disqualifies for operating two wallets
        rather than merging them.
      </p>
      <p>
        Go back and connect the wallet you registered. Everything else about this job is unchanged.{' '}
        <Link href="/set-and-earn/guide" className="prose-link">
          Read the guide
        </Link>
        .
      </p>
    </Callout>
  );
}
