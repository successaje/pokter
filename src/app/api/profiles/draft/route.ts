import { NextResponse } from 'next/server';
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem';

import { DRAFT_READ_WINDOW_MS, draftReadMessage, profileContentOf } from '@/lib/profiles/model';
import { getProfileStore } from '@/lib/profiles/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { signedByWallet } from '@/lib/wallet/signed-by';

export const dynamic = 'force-dynamic';

/**
 * The owner reading back their own unpublished profile.
 *
 * Published profiles are on the page for anyone; an unpublished one is
 * returned only to a request the wallet signed in the last half hour, so
 * a draft never leaks to someone who merely knows the address.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`profile-draft:${requestClientKey(request)}`, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests just now.' }, { status: 429 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }
  const wallet = String(body.wallet ?? '');
  const signature = String(body.signature ?? '');
  const signedAt = String(body.signedAt ?? '');
  const chainId = Number(body.chainId);
  const at = Date.parse(signedAt);
  if (!isAddress(wallet) || !isHex(signature) || (chainId !== 56 && chainId !== 97) || !Number.isFinite(at) || Math.abs(Date.now() - at) > DRAFT_READ_WINDOW_MS) {
    return NextResponse.json({ error: 'Sign the request again.' }, { status: 400 });
  }
  if (!(await signedByWallet(chainId, getAddress(wallet) as Address, draftReadMessage(wallet, signedAt), signature as Hex))) {
    return NextResponse.json({ error: 'That signature is not from this wallet.' }, { status: 403 });
  }
  const profile = getProfileStore().get(wallet);
  return NextResponse.json({ content: profile ? profileContentOf(profile) : null }, { headers: { 'cache-control': 'private, no-store' } });
}
