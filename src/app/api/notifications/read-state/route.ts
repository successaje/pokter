import { NextResponse } from 'next/server';
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem';

import {
  advanceWatermark, consumeIdentityChallenge, createIdentityChallenge,
  issueReadToken, readWatermark, revokeReadTokens, walletForReadToken,
} from '@/lib/notifications/server';
import { isEscrowChain } from '@/lib/network/escrow';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { signedByWallet } from '@/lib/wallet/signed-by';

export const dynamic = 'force-dynamic';

/**
 * Which inbox items a buyer has already seen, shared between their devices.
 *
 * The inbox is derived from job state on chain, so every device rebuilds
 * the same list; what never travelled was whether somebody had looked at
 * it. One watermark now does, and it only ever moves forward.
 *
 * Moving it is privileged, because hiding an unread "delivery ready" badge
 * can cost a buyer their review window. A device signs once and gets a
 * token that authorises exactly this and nothing else — so a leaked one
 * costs a wrong badge, not an inbox.
 *
 * The token travels in the Authorization header, never a query string: a
 * URL ends up in logs, history and referrers.
 */

function bearer(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`read-state:${requestClientKey(request)}`, { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  /*
   * Both of these need only the token: it already names the wallet and the
   * chain, so taking either from the body would mean trusting the caller
   * about who they are when the token has already said. They are answered
   * before the body is checked for a wallet, because they send none — the
   * first version put `disable` after that check, where it was
   * unreachable, and a device that had "stopped sharing" kept a working
   * token for another ninety days.
   */
  if (body.action === 'seen' || body.action === 'disable') {
    const holder = walletForReadToken(bearer(request));
    if (!holder) {
      return NextResponse.json({ error: 'This device is not set up to sync read state, or its permission expired.' }, { status: 401 });
    }
    if (body.action === 'disable') {
      /*
       * Revoking asks for no signature. Requiring one would leave somebody
       * who lost the key unable to stop it, and stopping gives nothing
       * away.
       */
      return NextResponse.json({ revoked: revokeReadTokens(holder.wallet, holder.chainId) });
    }
    const seenThrough = String(body.seenThrough ?? '');
    /*
     * An unparseable instant is refused rather than quietly ignored. The
     * marker would not move either way, and a client sending nonsense
     * should hear about it instead of reading success.
     */
    if (!Number.isFinite(Date.parse(seenThrough))) {
      return NextResponse.json({ error: 'A timestamp is required.' }, { status: 400 });
    }
    return NextResponse.json({ watermark: advanceWatermark({ ...holder, seenThrough }) });
  }

  const walletRaw = String(body.wallet ?? '');
  const chainId = Number(body.chainId);
  if (!isAddress(walletRaw) || !isEscrowChain(chainId)) {
    return NextResponse.json({ error: 'A wallet address and a supported chain are required.' }, { status: 400 });
  }
  const wallet = getAddress(walletRaw) as Address;

  if (body.action === 'challenge') {
    return NextResponse.json({ challenge: createIdentityChallenge({ wallet, chainId, purpose: { kind: 'read-sync' } }) });
  }

  if (body.action === 'enable') {
    const challengeId = String(body.challengeId ?? '');
    const signature = String(body.signature ?? '');
    if (!challengeId || !isHex(signature)) {
      return NextResponse.json({ error: 'A signed challenge is required.' }, { status: 400 });
    }
    const challenge = consumeIdentityChallenge(challengeId, 'read-sync');
    if (!challenge || challenge.wallet.toLowerCase() !== wallet.toLowerCase() || challenge.chainId !== chainId) {
      return NextResponse.json({ error: 'That challenge expired, was already used, or was issued for something else.' }, { status: 409 });
    }
    if (!(await signedByWallet(chainId, wallet, challenge.message, signature as Hex))) {
      return NextResponse.json({ error: 'That signature does not match this wallet.' }, { status: 403 });
    }
    return NextResponse.json({
      ...issueReadToken({ wallet, chainId }),
      watermark: readWatermark(wallet, chainId),
    });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

/** This wallet's watermark, for a device that has already been enabled. */
export async function GET(request: Request): Promise<NextResponse> {
  const holder = walletForReadToken(bearer(request));
  if (!holder) return NextResponse.json({ watermark: null, syncing: false });
  return NextResponse.json({ watermark: readWatermark(holder.wallet, holder.chainId), syncing: true });
}
