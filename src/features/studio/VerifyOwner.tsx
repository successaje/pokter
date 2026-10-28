'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getAddress } from 'viem';

import { CHAIN_ID } from '@/lib/network/presentation';
import { shortAddress } from '@/lib/ui/format';
import { useActiveWallet } from '@/lib/wallet/active';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';
import { useConnect } from '@/shell/wallet/ConnectProvider';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { Icon } from '@/ui/icons';

export type OwnedAgent = { chainId: number; tokenId: string; name: string; imageUrl: string | null; category: string | null; declaresProtocol: boolean; createdAt: string | null };

/** The agents a wallet owns on both registries; shared by every list of them so they cache together. */
export function useOwnedAgents(address: string | null | undefined) {
  return useQuery({
    queryKey: ['owned-agents', address],
    enabled: Boolean(address),
    queryFn: async () => {
      const r = await fetch(`/api/builders/agents?address=${address}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('The registry did not answer.');
      const body = (await r.json()) as { agents: OwnedAgent[]; unavailable?: number[] };
      /* Nothing found while a chain went unread is not "no agents". */
      if (body.agents.length === 0 && body.unavailable?.length) throw new Error('The agent index did not answer, so your agents could not be listed. Reload to try again.');
      return body;
    },
  });
}

/**
 * Prove the connected wallet owns its agents, here, and stay on this page.
 *
 * Verifying used to mean leaving for Import, typing an agent's number,
 * running a hire check and signing, then landing on that agent's page
 * rather than the jobs or proposals the builder had asked for. A Building
 * session belongs to the wallet, not to one agent, so any agent the wallet
 * owns can carry the challenge: this finds them, asks for one signature,
 * and reloads the page the builder was already on.
 *
 * The server still reads the registry before granting anything (see
 * /api/builders/verify); the list here only picks which agent to ask about.
 */
export function VerifyOwner() {
  const router = useRouter();
  const { openConnect } = useConnect();
  const active = useActiveWallet();
  const signer = useActiveSigner();
  const owned = useOwnedAgents(active.address);
  const [step, setStep] = useState<'idle' | 'signing' | 'checking' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!active.address) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button onClick={() => openConnect('to verify the agents you own')} icon={<Icon.Wallet size={16} />}>
          Connect the owner wallet
        </Button>
        <p className="text-[12.5px] text-ink-3">Pokter then asks it to sign one message. Signing moves no funds.</p>
      </div>
    );
  }

  const who = shortAddress(active.address);
  if (owned.isLoading) {
    return (
      <p className="text-[13.5px] text-ink-3" role="status">
        Looking up the agents {who} owns…
      </p>
    );
  }
  if (owned.isError) {
    return (
      <Notice tone="watch" title="Your agents could not be listed" action={<Button size="s" intent="secondary" onClick={() => void owned.refetch()}>Try again</Button>}>
        {(owned.error as Error).message}
      </Notice>
    );
  }

  const agents = owned.data?.agents ?? [];
  if (agents.length === 0) {
    return <p className="text-[13.5px] text-ink-2">{who} owns no agents on BNB Chain or BNB Testnet. Connect the wallet that registered yours, or create one.</p>;
  }

  /* A passkey account exists on chain only where it has acted, so ask about an agent on that network first. */
  const subject = (active.mode === 'passkey' ? agents.find((a) => a.chainId === CHAIN_ID) : undefined) ?? agents[0];

  async function verify() {
    setError(null);
    setStep('signing');
    try {
      const c = await fetch('/api/builders/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'challenge', chainId: subject.chainId, tokenId: subject.tokenId }) });
      const challenge = (await c.json()) as { challenge?: { id: string; message: string; owner?: string }; error?: string };
      if (!c.ok || !challenge.challenge) throw new Error(challenge.error ?? 'Could not prepare the ownership check.');
      if (challenge.challenge.owner && getAddress(challenge.challenge.owner) !== getAddress(active.address!)) {
        throw new Error(`The registry now lists another owner for ${subject.name}. Reload and try again.`);
      }
      const signature = await signer.sign(challenge.challenge.message);
      setStep('checking');
      const v = await fetch('/api/builders/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'verify', challengeId: challenge.challenge.id, signature }) });
      const verified = (await v.json()) as { error?: string };
      if (!v.ok) throw new Error(verified.error ?? 'Ownership could not be verified.');
      setStep('done');
      router.refresh();
    } catch (reason) {
      const message = (reason as Error)?.message ?? '';
      setError(/reject|denied|cancel|NotAllowed/i.test(message) ? 'You declined the signature. Nothing was shared.' : message || 'Ownership could not be verified.');
      setStep('idle');
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={() => void verify()} busy={step !== 'idle'} disabled={!signer.canSign} icon={<Icon.Key size={16} />}>
        {step === 'done' ? 'Verified, loading…' : step === 'checking' ? 'Checking the signature…' : step === 'signing' ? 'Waiting for your wallet…' : `Verify ${who}`}
      </Button>
      <p className="text-[12.5px] text-ink-3">
        Owns {agents.length === 1 ? agents[0].name : `${agents.length} agents`}. One signed message proves it; signing moves no funds, and the access lasts seven days.
      </p>
      {error && (
        <Notice tone="bad" title="Not verified">
          {error}
        </Notice>
      )}
    </div>
  );
}
