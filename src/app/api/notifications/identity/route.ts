import { NextResponse } from 'next/server';
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem';

import { identityState, maskEmail } from '@/lib/notifications/identity';
import {
  consumeIdentityChallenge, createIdentityChallenge, readIdentity,
  recordIdentityProof, removeIdentity,
} from '@/lib/notifications/server';
import { isEscrowChain } from '@/lib/network/escrow';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { signedByWallet, walletCanBeChecked } from '@/lib/wallet/signed-by';

export const dynamic = 'force-dynamic';

/**
 * One notification email per wallet, proven by the wallet.
 *
 * Per-job subscriptions already worked, and carried a wallet address that
 * nobody checked. This is the proven association they could not be: the
 * wallet signs a short-lived single-use challenge, the inbox confirms a
 * link, and only then may Pokter reuse the address without asking somebody
 * to type it again.
 *
 * The signature check is the same one publisher verification uses
 * (`wallet/signed-by.ts`), so an EOA, a passkey smart account and a
 * contract wallet are all judged by one rule rather than two that drift.
 *
 * Nothing here subscribes anybody to anything. The identity says where
 * updates may be sent; each job is still opted into on its own.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`notify-identity:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const walletRaw = String(body.wallet ?? '');
  const chainId = Number(body.chainId);
  if (!isAddress(walletRaw) || !isEscrowChain(chainId)) {
    return NextResponse.json({ error: 'A wallet address and a supported chain are required.' }, { status: 400 });
  }
  const wallet = getAddress(walletRaw) as Address;

  if (body.action === 'challenge') {
    const email = String(body.email ?? '').trim().toLowerCase();
    /*
     * Shape only. Whether the inbox exists is settled by the link, which is
     * the one check that actually proves it.
     */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 });
    }
    return NextResponse.json({ challenge: createIdentityChallenge({ wallet, chainId, email }) });
  }

  if (body.action === 'claim') {
    const challengeId = String(body.challengeId ?? '');
    const signature = String(body.signature ?? '');
    if (!challengeId || !isHex(signature)) {
      return NextResponse.json({ error: 'A signed challenge is required.' }, { status: 400 });
    }

    /*
     * Consumed on read: expired or already used, and it is gone. A replayed
     * signature must not be able to bind an inbox a second time.
     */
    const challenge = consumeIdentityChallenge(challengeId);
    if (!challenge) {
      return NextResponse.json({ error: 'That challenge expired or was already used. Ask for a new one.' }, { status: 409 });
    }
    if (challenge.wallet.toLowerCase() !== wallet.toLowerCase() || challenge.chainId !== chainId) {
      return NextResponse.json({ error: 'That challenge was issued for a different wallet.' }, { status: 403 });
    }

    if (!(await walletCanBeChecked(chainId, wallet, signature as Hex))) {
      return NextResponse.json(
        { error: 'This smart account has no code on chain yet, so its signature cannot be checked. Send a transaction from it first.' },
        { status: 409 },
      );
    }
    if (!(await signedByWallet(chainId, wallet, challenge.message, signature as Hex))) {
      return NextResponse.json({ error: 'That signature does not match this wallet.' }, { status: 403 });
    }

    /*
     * The proof is recorded and the inbox still has to confirm. Both halves
     * are required before anything is called enabled — see
     * `identityState`.
     */
    const token = crypto.randomUUID();
    recordIdentityProof({ wallet, chainId, email: challenge.email, token });
    const row = readIdentity(wallet, chainId);

    return NextResponse.json({
      state: identityState(row),
      email: maskEmail(challenge.email),
      /*
       * The link is returned rather than emailed from here: sending live
       * mail is a separate, approved step, and a route that silently sent
       * it would make every test run a real send.
       */
      verification: { token },
      next: 'Confirm the link sent to that address. Until it is confirmed, nothing is sent there.',
    });
  }

  if (body.action === 'remove') {
    const challengeId = String(body.challengeId ?? '');
    const signature = String(body.signature ?? '');
    if (!challengeId || !isHex(signature)) {
      return NextResponse.json({ error: 'Removing an address needs the same wallet proof as adding one.' }, { status: 400 });
    }
    const challenge = consumeIdentityChallenge(challengeId);
    if (!challenge || challenge.wallet.toLowerCase() !== wallet.toLowerCase()) {
      return NextResponse.json({ error: 'That challenge expired, was already used, or is for another wallet.' }, { status: 409 });
    }
    if (!(await signedByWallet(chainId, wallet, challenge.message, signature as Hex))) {
      return NextResponse.json({ error: 'That signature does not match this wallet.' }, { status: 403 });
    }
    removeIdentity(wallet, chainId);
    return NextResponse.json({ state: 'none' });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}

/**
 * What this wallet has, masked.
 *
 * Never the full address: it belongs in the inbox and not in a response a
 * screenshot or a log can carry.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const walletRaw = url.searchParams.get('wallet') ?? '';
  const chainId = Number(url.searchParams.get('chainId'));
  if (!isAddress(walletRaw) || !isEscrowChain(chainId)) {
    return NextResponse.json({ error: 'A wallet address and a supported chain are required.' }, { status: 400 });
  }
  const row = readIdentity(getAddress(walletRaw), chainId);
  return NextResponse.json({
    state: identityState(row),
    email: row ? maskEmail(row.email) : null,
  });
}
