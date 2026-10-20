'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { shortAddress } from '@/lib/ui/format';
import { useActiveWallet } from '@/lib/wallet/active';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';

/**
 * Says so when Building's sign-in belongs to a different wallet than the
 * one connected.
 *
 * The sign-in is a cookie for the wallet that proved ownership, and
 * switching wallets in the browser does not touch it — so the pages kept
 * showing one wallet's agents while another was connected, with nothing
 * to say which was which. The server already re-checks the registry
 * owner for every owner action; this makes the mismatch visible and gives
 * one click out of it.
 */
export function SessionWalletCheck() {
  const { address } = useActiveWallet();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const session = useQuery({
    queryKey: ['builder-session'],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch('/api/builders/session', { cache: 'no-store' });
      return (await r.json()) as { authenticated: boolean; owner?: string };
    },
  });
  const owner = session.data?.authenticated ? session.data.owner : undefined;
  if (!owner || !address || owner.toLowerCase() === address.toLowerCase()) return null;

  const signOut = async () => {
    setBusy(true);
    await fetch('/api/builders/session', { method: 'DELETE' }).catch(() => null);
    await queryClient.invalidateQueries({ queryKey: ['builder-session'] });
    router.refresh();
    setBusy(false);
  };

  return (
    <Notice
      tone="watch"
      className="mb-6"
      title={`Signed in as ${shortAddress(owner)}, but ${shortAddress(address)} is connected`}
      action={
        <Button size="s" intent="secondary" onClick={signOut} busy={busy}>
          Sign out of {shortAddress(owner)}
        </Button>
      }
    >
      These pages show the agents of the wallet that signed in. Sign out, then verify with the connected wallet to manage its agents, or switch back to {shortAddress(owner)}.
    </Notice>
  );
}
