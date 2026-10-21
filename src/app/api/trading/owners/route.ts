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
  store.setOwners(wallet, owners, issuedAt);
  return NextResponse.json({ ok: true, owners });
}
