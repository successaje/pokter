import { NextResponse } from 'next/server';
import { getAddress, isAddress, isHex, verifyMessage, type Address, type Hex } from 'viem';

import { BUILDER_SESSION_COOKIE, BUILDER_SESSION_SECONDS, createBuilderChallenge, createBuilderSession, consumeBuilderChallenge, readBuilderChallenge, saveVerifiedPublisher } from '@/lib/builders/store';
import { registryClient, registryOwner } from '@/lib/registry/onchain';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Who owns an identity, from the registry first.
 *
 * The indexer was the only source, and it has no row for an agent minted a
 * minute ago — so the builder who had just registered one, with the owner
 * wallet still connected, was told the identity could not be read and sent
 * to verify an agent that by then had no public record. The registry is
 * both authoritative and immediate; the indexer stays as the fallback for
 * when an RPC read fails.
 */
async function ownerOfIdentity(chainId: ChainId, tokenId: string): Promise<Address | null> {
  const onchain = await registryOwner(chainId, tokenId);
  if (onchain) return onchain;
  try {
    const agent = await getAgent(chainId, tokenId);
    return isAddress(agent.owner_address) ? getAddress(agent.owner_address) : null;
  } catch {
    return null;
  }
}

/**
 * The signature check, which now also accepts a contract wallet.
 *
 * `verifyMessage` from viem recovers an EOA and nothing else, so a smart
 * account could own an agent and never prove it. With a chain client the
 * same call falls through to ERC-1271, which is how a contract wallet says
 * a signature is its own. EOAs are unaffected.
 */
async function signedByOwner(chainId: number, owner: Address, message: string, signature: Hex): Promise<boolean> {
  const client = registryClient(chainId);
  try {
    if (client) return await client.verifyMessage({ address: owner, message, signature });
  } catch {
    /* An RPC failure must not pass an unverified signature; fall back to
       the local EOA check, which is what this did before. */
  }
  return verifyMessage({ address: owner, message, signature });
}

/** An EIP-191 signature is 65 bytes; a contract-wallet signature is not. */
function looksLikeEoaSignature(signature: Hex): boolean {
  return signature.length === 132;
}

/**
 * Whether a smart-account signature could be checked at all.
 *
 * A smart account validates its own signatures, so if it has no code the
 * check cannot even be attempted — and the Altana SDK is explicit that a
 * freshly created wallet is counterfactual until its first `execute`. A
 * wallet in that state is told what is actually true, rather than that
 * its signature did not match, which would send somebody hunting for a
 * wallet they do not have.
 */
async function ownerCanBeChecked(chainId: number, owner: Address, signature: Hex): Promise<boolean> {
  if (looksLikeEoaSignature(signature)) return true;
  const client = registryClient(chainId);
  if (!client) return true;
  try {
    const code = await client.getCode({ address: owner });
    return Boolean(code && code !== '0x');
  } catch {
    /* Unknown is not a refusal: let the signature check decide. */
    return true;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`builder-verify:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Verification limit reached. Try again shortly.' }, { status: 429 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 }); }

  if (body.action === 'challenge') {
    const chainId = Number(body.chainId) as ChainId;
    const tokenId = String(body.tokenId ?? '');
    if (![56, 97].includes(chainId) || !/^\d+$/.test(tokenId)) {
      return NextResponse.json({ error: 'A valid ERC-8004 identity is required.' }, { status: 400 });
    }
    const owner = await ownerOfIdentity(chainId, tokenId);
    if (!owner) return NextResponse.json({ error: 'The ERC-8004 identity could not be read.' }, { status: 502 });
    return NextResponse.json({ challenge: createBuilderChallenge({ chainId, tokenId, owner }) });
  }

  if (body.action === 'verify') {
    const challengeId = String(body.challengeId ?? '');
    const signature = String(body.signature ?? '');
    if (!challengeId || !isHex(signature)) return NextResponse.json({ error: 'The signed challenge is invalid.' }, { status: 400 });
    const challenge = readBuilderChallenge(challengeId);
    if (!challenge) return NextResponse.json({ error: 'This challenge expired or was already used.' }, { status: 409 });
    try {
      if (!(await ownerCanBeChecked(challenge.chainId, challenge.owner, signature as Hex))) {
        return NextResponse.json(
          {
            error:
              'This wallet has not acted on chain yet, so it cannot prove ownership by signature. A smart-account wallet is only created on chain by its first transaction.',
          },
          { status: 409 },
        );
      }
      if (!(await signedByOwner(challenge.chainId, challenge.owner, challenge.message, signature as Hex))) {
        return NextResponse.json({ error: 'The signature does not match the registered owner.' }, { status: 403 });
      }
      const owner = await ownerOfIdentity(challenge.chainId as ChainId, challenge.tokenId);
      if (!owner || owner !== getAddress(challenge.owner)) {
        return NextResponse.json({ error: 'The registry owner changed during verification. Start again.' }, { status: 409 });
      }
      if (!consumeBuilderChallenge(challengeId)) {
        return NextResponse.json({ error: 'This challenge expired or was already used.' }, { status: 409 });
      }
      const publisher = saveVerifiedPublisher({ ...challenge, signature: signature as Hex });
      const response = NextResponse.json({ publisher });
      response.cookies.set(BUILDER_SESSION_COOKIE, createBuilderSession(challenge.owner), {
        httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
        path: '/', maxAge: BUILDER_SESSION_SECONDS, priority: 'high',
      });
      return response;
    } catch { return NextResponse.json({ error: 'Ownership verification could not be completed.' }, { status: 502 }); }
  }
  return NextResponse.json({ error: 'Unknown verification action.' }, { status: 400 });
}
