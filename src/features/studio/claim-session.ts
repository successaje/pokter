'use client';

import { getAddress } from 'viem';

import { connectIdentityWallet, hasIdentityWallet, signIdentityMessage } from '@/lib/registry/wallet';

/**
 * Turn a registration completed in this browser into Studio access.
 *
 * Registering an agent and then being told to "verify ownership to manage
 * this agent" reads as Pokter not having noticed what it just did. The
 * wallet is connected, it has just paid for two transactions, and the next
 * screen asks it to prove it exists.
 *
 * The proof is still a signature, because a transaction hash is public and
 * anyone could replay somebody else's registration to claim their session.
 * What changes is when it is asked for: once, in the flow, while the wallet
 * is already open — not on a separate page the builder has to find.
 *
 * Best effort by design. A declined or impossible signature leaves the
 * registration exactly as it was and the import path still works; the
 * success panel says which happened rather than pretending either way.
 */

export type ClaimOutcome = 'claimed' | 'declined' | 'unavailable' | 'failed';

export async function claimStudioSession(input: {
  chainId: number;
  tokenId: string;
}): Promise<ClaimOutcome> {
  if (!hasIdentityWallet()) return 'unavailable';
  try {
    /*
     * The signing address comes from the wallet rather than from React
     * state. Registration goes through the injected provider directly,
     * which a wagmi connection is not a precondition for, so the hook's
     * idea of the connected account can be empty while the wallet that
     * just minted is right there. Already connected, so no prompt.
     */
    const address = await connectIdentityWallet();

    const c = await fetch('/api/builders/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'challenge', chainId: input.chainId, tokenId: input.tokenId }),
    });
    const challenge = (await c.json()) as { challenge?: { id: string; message: string; owner?: string } };
    if (!c.ok || !challenge.challenge) return 'failed';

    /* The challenge names the registry's owner; signing with anything else
       would fail server-side with a less useful message than this one. */
    if (challenge.challenge.owner && getAddress(challenge.challenge.owner) !== address) return 'unavailable';

    const signature = await signIdentityMessage(address, challenge.challenge.message);

    const v = await fetch('/api/builders/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'verify', challengeId: challenge.challenge.id, signature }),
    });
    return v.ok ? 'claimed' : 'failed';
  } catch (reason) {
    const message = (reason as Error)?.message ?? '';
    if (/reject|denied|cancel|NotAllowed/i.test(message)) return 'declined';
    return 'failed';
  }
}
