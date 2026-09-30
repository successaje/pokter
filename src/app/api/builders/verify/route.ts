import { NextResponse } from 'next/server';
import { getAddress, isAddress, isHex, verifyMessage, type Hex } from 'viem';

import { createBuilderChallenge, consumeBuilderChallenge, readBuilderChallenge, saveVerifiedPublisher } from '@/lib/builders/store';
import { getAgent } from '@/lib/scan/client';
import type { ChainId } from '@/lib/scan/types';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

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
    try {
      const agent = await getAgent(chainId, tokenId);
      if (!isAddress(agent.owner_address)) return NextResponse.json({ error: 'The registry exposes no valid owner wallet.' }, { status: 409 });
      return NextResponse.json({ challenge: createBuilderChallenge({ chainId, tokenId, owner: getAddress(agent.owner_address) }) });
    } catch { return NextResponse.json({ error: 'The ERC-8004 identity could not be read.' }, { status: 502 }); }
  }

  if (body.action === 'verify') {
    const challengeId = String(body.challengeId ?? '');
    const signature = String(body.signature ?? '');
    if (!challengeId || !isHex(signature)) return NextResponse.json({ error: 'The signed challenge is invalid.' }, { status: 400 });
    const challenge = readBuilderChallenge(challengeId);
    if (!challenge) return NextResponse.json({ error: 'This challenge expired or was already used.' }, { status: 409 });
    try {
      if (!(await verifyMessage({ address: challenge.owner, message: challenge.message, signature: signature as Hex }))) {
        return NextResponse.json({ error: 'The signature does not match the registered owner.' }, { status: 403 });
      }
      const agent = await getAgent(challenge.chainId as ChainId, challenge.tokenId);
      if (!isAddress(agent.owner_address) || getAddress(agent.owner_address) !== getAddress(challenge.owner)) {
        return NextResponse.json({ error: 'The registry owner changed during verification. Start again.' }, { status: 409 });
      }
      if (!consumeBuilderChallenge(challengeId)) {
        return NextResponse.json({ error: 'This challenge expired or was already used.' }, { status: 409 });
      }
      return NextResponse.json({ publisher: saveVerifiedPublisher({ ...challenge, signature: signature as Hex }) });
    } catch { return NextResponse.json({ error: 'Ownership verification could not be completed.' }, { status: 502 }); }
  }
  return NextResponse.json({ error: 'Unknown verification action.' }, { status: 400 });
}
