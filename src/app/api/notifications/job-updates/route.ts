import { NextResponse } from 'next/server';
import { getErc8183Job } from '@altananetwork/sdk';
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem';

import { altanaNetworkFor } from '@/lib/altana/client';
import { maskEmail } from '@/lib/notifications/identity';
import { jobUpdateOffer } from '@/lib/notifications/job-updates';
import {
  consumeIdentityChallenge, createIdentityChallenge, readIdentity,
  readJobUpdateRow, stopJobUpdates, subscribeFromIdentity,
} from '@/lib/notifications/server';
import { isEscrowChain } from '@/lib/network/escrow';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { signedByWallet } from '@/lib/wallet/signed-by';

export const dynamic = 'force-dynamic';

/**
 * Email updates for one job, for a wallet that has already proven an
 * address.
 *
 * The address never travels in the request: it is read from the wallet's
 * own identity on the server. So the only thing a caller can ask for is
 * that a wallet's own proven inbox hears about a wallet's own job, and
 * there is nothing to disclose by asking.
 *
 * Stopping is not the mirror image. Silencing a delivery email can make a
 * buyer miss their review window and let a job settle unexamined, so it
 * costs a wallet signature over text that names the job — or the
 * unsubscribe link in any of the emails, which proves the inbox instead.
 */

function identify(body: Record<string, unknown>): { wallet: Address; chainId: number; jobId: string } | null {
  const walletRaw = String(body.wallet ?? '');
  const chainId = Number(body.chainId);
  const jobId = String(body.jobId ?? '').trim();
  if (!isAddress(walletRaw) || !isEscrowChain(chainId) || !/^\d+$/.test(jobId)) return null;
  return { wallet: getAddress(walletRaw) as Address, chainId, jobId };
}

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`job-updates:${requestClientKey(request)}`, { limit: 12, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const who = identify(body);
  if (!who) {
    return NextResponse.json({ error: 'A wallet address, a supported chain and a job ID are required.' }, { status: 400 });
  }
  const { wallet, chainId, jobId } = who;

  if (body.action === 'on') {
    /*
     * The same on-chain check the typed-address route makes: whoever asks
     * has to be the job's client. Without it this would still only reach
     * the wallet's own inbox, but it keeps a stranger from switching on
     * mail about a job that is nothing to do with them.
     */
    let client: string;
    try {
      client = (await getErc8183Job(altanaNetworkFor(chainId), BigInt(jobId))).client;
    } catch {
      return NextResponse.json({ error: 'That job could not be read from the escrow just now. Try again shortly.' }, { status: 502 });
    }
    if (client.toLowerCase() !== wallet.toLowerCase()) {
      return NextResponse.json({ error: 'That wallet is not the on-chain client for this job.' }, { status: 403 });
    }

    const result = subscribeFromIdentity({ wallet, chainId, jobId, includeAnswer: body.includeAnswer === true });
    if (!result.ok) {
      return NextResponse.json(
        { error: 'This wallet has no confirmed email address yet. Add one first.', reason: result.reason },
        { status: 409 },
      );
    }
    return NextResponse.json({ offer: present({ wallet, chainId, jobId }) });
  }

  if (body.action === 'challenge-off') {
    return NextResponse.json({ challenge: createIdentityChallenge({ wallet, chainId, purpose: { kind: 'stop-job', jobId } }) });
  }

  if (body.action === 'off') {
    const challengeId = String(body.challengeId ?? '');
    const signature = String(body.signature ?? '');
    if (!challengeId || !isHex(signature)) {
      return NextResponse.json({ error: 'Stopping updates needs a signed challenge from this wallet.' }, { status: 400 });
    }
    const challenge = consumeIdentityChallenge(challengeId, 'stop-job');
    /*
     * The job is checked as well as the wallet. A challenge signed to
     * silence one job must not silence another.
     */
    if (!challenge || challenge.wallet.toLowerCase() !== wallet.toLowerCase() || challenge.jobId !== jobId) {
      return NextResponse.json({ error: 'That challenge expired, was already used, or was issued for another job.' }, { status: 409 });
    }
    if (!(await signedByWallet(chainId, wallet, challenge.message, signature as Hex))) {
      return NextResponse.json({ error: 'That signature does not match this wallet.' }, { status: 403 });
    }
    stopJobUpdates({ wallet, chainId, jobId });
    return NextResponse.json({ offer: present({ wallet, chainId, jobId }) });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const who = identify({
    wallet: url.searchParams.get('wallet') ?? '',
    chainId: url.searchParams.get('chainId') ?? '',
    jobId: url.searchParams.get('jobId') ?? '',
  });
  if (!who) {
    return NextResponse.json({ error: 'A wallet address, a supported chain and a job ID are required.' }, { status: 400 });
  }
  return NextResponse.json({ offer: present(who) });
}

/** The offer, with the address masked: the full one belongs in the inbox. */
function present(who: { wallet: Address; chainId: number; jobId: string }) {
  const offer = jobUpdateOffer({
    identity: readIdentity(who.wallet, who.chainId),
    row: readJobUpdateRow(who),
  });
  return 'email' in offer ? { ...offer, email: maskEmail(offer.email) } : offer;
}
