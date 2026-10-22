import { NextResponse } from 'next/server';
import { getAddress, isAddress, isHex, type Hex } from 'viem';

import { normaliseOwners, ownersMessage, ownersSignatureProblem } from '@/lib/trading/owners';
import { getTradingStore } from '@/lib/trading/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { signedByWallet, walletCanBeChecked } from '@/lib/wallet/signed-by';

export const dynamic = 'force-dynamic';

/**
 * Set the addresses a watched trading wallet's owner calls their own.
 *
 * Signed by the watched wallet, over the exact list and a recent time:
 * these addresses are where money may go without an alert, so nobody but
 * whoever controls the wallet may name them. A list signed earlier than
 * the one saved is refused, so a captured signature cannot restore an
 * address the owner has since removed.
 *
 * The signature is verified before anything is written, and the write
 * itself decides again whether this list is still the newest. Checking
 * once here was not enough: verifying takes two round trips, a second
 * accepted request can finish inside them, and both requests would then
 * have been checked against the same stale snapshot. See `owner-list.ts`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`trading-owners:${requestClientKey(request)}`, { limit: 5, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'retry-after': String(rate.retryAfterSeconds) } });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const wallet = String(body.wallet ?? '');
  const signature = String(body.signature ?? '');
  const issuedAt = String(body.issuedAt ?? '');
  if (!isAddress(wallet)) return NextResponse.json({ error: 'Enter the trading wallet’s address.' }, { status: 400 });
  if (!isHex(signature)) return NextResponse.json({ error: 'Sign the list with the trading wallet.' }, { status: 400 });
  const owners = normaliseOwners(wallet, Array.isArray(body.owners) ? body.owners : []);
  if (!owners) return NextResponse.json({ error: 'Up to five valid addresses, other than the trading wallet itself.' }, { status: 400 });

  const store = getTradingStore();
  const watched = store.get(wallet);
  if (!watched) return NextResponse.json({ error: 'Watch this wallet first.' }, { status: 409 });
  /* Cheap refusals first, so an expired or replayed signature costs no RPC
     call. It cannot stand in for the guard on the write: it reads the list
     as it was before the two awaits below. */
  const problem = ownersSignatureProblem({ issuedAt, now: Date.now(), lastSignedAt: watched.ownersSignedAt });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const address = getAddress(wallet);
  const message = ownersMessage({ wallet, owners, issuedAt });
  if (!(await walletCanBeChecked(56, address, signature as Hex))) {
    return NextResponse.json({ error: 'This wallet has not been used on BNB Chain yet, so its signature cannot be checked.' }, { status: 409 });
  }
  if (!(await signedByWallet(56, address, message, signature as Hex))) {
    return NextResponse.json({ error: 'That signature is not from the trading wallet.' }, { status: 403 });
  }

  /* Verified, so it may be written — and only now is it asked whether it is
     still the newest. The write drops a list older than the one recorded,
     which is what keeps a request that overlapped this one from losing the
     newer list the owner actually asked for. */
  const written = store.setOwners(wallet, owners, issuedAt);
  if (written === 'not-watched') return NextResponse.json({ error: 'Watch this wallet first.' }, { status: 409 });
  if (written === 'not-newer') {
    /* A conflict found at the write rather than on arrival, so the saved
       list goes back with it: the page asked to set one and needs to know
       which one it actually has. */
    return NextResponse.json({ error: 'A newer list of owner addresses is already saved.', owners: store.owners(wallet) }, { status: 409 });
  }
  return NextResponse.json({ ok: true, owners });
}
