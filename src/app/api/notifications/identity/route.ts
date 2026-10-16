import { NextResponse } from 'next/server';
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem';

import { confirmedAddress, identityState, maskEmail } from '@/lib/notifications/identity';
import { describeAddressChange, type AddressChangeChoice } from '@/lib/notifications/preferences';
import {
  claimNotificationEmail, consumeIdentityChallenge, createIdentityChallenge,
  readIdentity, removeIdentity, runningJobUpdates,
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
    return NextResponse.json({
      challenge: createIdentityChallenge({ wallet, chainId, purpose: { kind: 'claim', email } }),
      /*
       * What a change would do to work already running, so the buyer reads
       * it before signing rather than after.
       */
      running: runningJobUpdates(wallet, chainId).length,
    });
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
    const challenge = consumeIdentityChallenge(challengeId, 'claim');
    if (!challenge) {
      return NextResponse.json({ error: 'That challenge expired, was already used, or was issued for something else. Ask for a new one.' }, { status: 409 });
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
    /*
     * What happens to running jobs if this is a change. Defaults to
     * carrying them over: a buyer replacing an address has not asked to
     * stop hearing about work they already paid for.
     */
    const onVerify: AddressChangeChoice = body.runningJobs === 'stop' ? 'stop' : 'move';
    /*
     * Mailed from the server, and the token never comes back here.
     *
     * The first version returned it, so that tests need not send real mail.
     * That handed the second half of the proof to whoever asked for it: a
     * wallet could sign for any stranger's address, redeem the link itself,
     * and Pokter would start mailing somebody who never agreed to hear from
     * it. The signature says where updates may go; only the inbox can say
     * it wants them.
     */
    const sent = await claimNotificationEmail({ wallet, chainId, email: challenge.email, onVerify });
    const row = readIdentity(wallet, chainId);

    if (!sent.emailed) {
      /*
       * The proof is already stored, so this is retryable rather than
       * broken: asking again replaces the pending link instead of stacking
       * a second one.
       */
      console.error('[notifications/identity] confirmation not sent:', sent.reason);
      return NextResponse.json(
        {
          state: identityState(row),
          email: maskEmail(challenge.email),
          error: 'Your wallet signed, but the confirmation email could not be sent just now. Try again in a moment; nothing is sent to that address until it is confirmed.',
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      state: identityState(row),
      email: maskEmail(challenge.email),
      next: describeAddressChange(onVerify, runningJobUpdates(wallet, chainId).length),
    });
  }

  /*
   * Removal is asked for separately, because the text a wallet signs has to
   * describe what it does. A challenge issued to add an address says
   * "Allow Pokter to send..." — redeeming that to remove one would have
   * the buyer authorising the opposite of what happens.
   */
  if (body.action === 'challenge-remove') {
    return NextResponse.json({ challenge: createIdentityChallenge({ wallet, chainId, purpose: { kind: 'stop-email' } }) });
  }

  if (body.action === 'remove') {
    const challengeId = String(body.challengeId ?? '');
    const signature = String(body.signature ?? '');
    if (!challengeId || !isHex(signature)) {
      return NextResponse.json({ error: 'Removing an address needs the same wallet proof as adding one.' }, { status: 400 });
    }
    const challenge = consumeIdentityChallenge(challengeId, 'stop-email');
    if (!challenge || challenge.wallet.toLowerCase() !== wallet.toLowerCase()) {
      return NextResponse.json({ error: 'That challenge expired, was already used, or is for another wallet.' }, { status: 409 });
    }
    if (!(await signedByWallet(chainId, wallet, challenge.message, signature as Hex))) {
      return NextResponse.json({ error: 'That signature does not match this wallet.' }, { status: 403 });
    }
    const { stoppedJobs } = removeIdentity(wallet, chainId);
    return NextResponse.json({ state: 'none', stoppedJobs });
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
  const wallet = getAddress(walletRaw);
  const row = readIdentity(wallet, chainId);
  const state = identityState(row);
  return NextResponse.json({
    state,
    /*
     * Tied to the state, not merely to the row's existence. A removed row
     * keeps its address so a later claim of the same one can be
     * recognised, and reporting it alongside `state: "none"` left the two
     * fields disagreeing about whether this wallet has an address.
     */
    email: state === 'none' ? null : maskEmail(row!.email),
    /*
     * Where mail can actually go right now: during a change the old
     * address, and on a first claim nothing at all. Reporting the new one
     * had Settings claim an inbox that has confirmed nothing was already
     * receiving.
     */
    sendingTo: confirmedAddress(row) ? maskEmail(confirmedAddress(row)!) : null,
    jobs: runningJobUpdates(wallet, chainId),
  });
}
