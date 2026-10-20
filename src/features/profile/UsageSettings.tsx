'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAccount } from 'wagmi';

import { isEscrowChain } from '@/lib/network/escrow';
import { CHAIN_ID } from '@/lib/network/presentation';
import { draftReadMessage, EMPTY_PROFILE, type ProfileContent, type Usage } from '@/lib/profiles/model';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { Notice } from '@/ui/Feedback';
import { UsageChoice, useSaveProfile } from './ProfileEditor';
import { rememberedUsage } from './usage';

/**
 * "How you use Pokter", in Settings.
 *
 * Changing it re-signs the profile with only that field changed:
 * published content, sections and agents stay exactly as they were, so
 * switching to Build or Hire never publishes anything. A private profile
 * is read back with one signature first, since its content is not on any
 * page.
 */
export function UsageSettings() {
  const { address, sign, canSign } = useActiveSigner();
  const { chain } = useAccount();
  const queryClient = useQueryClient();
  const save = useSaveProfile(address ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const state = useQuery({
    queryKey: ['profile-state', address],
    enabled: Boolean(address),
    queryFn: async () => {
      const r = await fetch(`/api/profiles?wallet=${address}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('Your profile could not be read.');
      return (await r.json()) as { exists: boolean; published: ProfileContent | null };
    },
  });

  if (!address) return <p className="text-[13.5px] text-ink-3">Connect a wallet to choose how you use Pokter.</p>;
  if (state.isPending) return <p className="text-[13.5px] text-ink-3">Loading…</p>;
  if (state.isError) return <Notice tone="watch">Your current choice could not be read. Reload to try again.</Notice>;
  const current: Usage | '' = state.data.published?.usage || rememberedUsage(address);

  const change = async (usage: Usage) => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      let base: ProfileContent = state.data.published ?? EMPTY_PROFILE;
      if (!state.data.published && state.data.exists) {
        if (!canSign) throw new Error('Connect this wallet to sign.');
        const signedAt = new Date().toISOString();
        const chainId = chain && isEscrowChain(chain.id) ? chain.id : CHAIN_ID;
        const signature = await sign(draftReadMessage(address, signedAt));
        const r = await fetch('/api/profiles/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: address, signedAt, signature, chainId }) });
        const body = (await r.json().catch(() => ({}))) as { content?: ProfileContent | null; error?: string };
        if (!r.ok) throw new Error(body.error ?? 'Your profile could not be read.');
        base = body.content ?? EMPTY_PROFILE;
      }
      await save({ ...base, usage });
      await queryClient.invalidateQueries({ queryKey: ['profile-state', address] });
      setDone(true);
    } catch (caught) {
      const message = (caught as Error).message || 'That was not saved.';
      setError(/reject|denied/i.test(message) ? 'You declined the signature. Nothing changed.' : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <UsageChoice value={current} onChange={(u) => void change(u)} />
      <p className="text-[12.5px] text-ink-3">
        {busy ? 'Approve in your wallet…' : 'Shapes your navigation and what your profile leads with. It grants nothing, keeps every agent, job and review, and never publishes anything.'}
      </p>
      {done && <Notice tone="ok">Saved.</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}
