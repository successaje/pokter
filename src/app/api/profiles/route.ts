import { NextResponse } from 'next/server';
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem';

import { isEmptyProfile, PROFILE_EDIT_WINDOW_MS, profileMessage, readProfileContent } from '@/lib/profiles/model';
import { getProfileStore } from '@/lib/profiles/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { signedByWallet, walletCanBeChecked } from '@/lib/wallet/signed-by';

export const dynamic = 'force-dynamic';

/**
 * Set or clear a wallet's self-provided profile.
 *
 * Signed by the wallet, so nobody else can write a profile for it — and
 * that is all the signature proves. The edit must be fresh and newer than
 * the one it replaces, so a captured signature cannot put old text back.
 * Empty content clears the profile.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`profile:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many edits just now. Try again shortly.' }, { status: 429 });

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
  const content = readProfileContent(body.content);
  if (!isAddress(wallet) || !isHex(signature) || !content || (chainId !== 56 && chainId !== 97)) {
    return NextResponse.json({ error: 'The profile could not be read, or breaks a limit.' }, { status: 400 });
  }

  const at = Date.parse(signedAt);
  if (!Number.isFinite(at) || Math.abs(Date.now() - at) > PROFILE_EDIT_WINDOW_MS) {
    return NextResponse.json({ error: 'This edit was signed too long ago. Sign it again.' }, { status: 400 });
  }
  const store = getProfileStore();
  const current = store.get(wallet);
  if (current && Date.parse(current.signedAt) >= at) {
    return NextResponse.json({ error: 'A newer edit is already saved.' }, { status: 409 });
  }

  const owner = getAddress(wallet) as Address;
  if (!(await walletCanBeChecked(chainId, owner, signature as Hex))) {
    return NextResponse.json({ error: 'This wallet has no code on chain yet, so its signature cannot be checked.' }, { status: 409 });
  }
  if (!(await signedByWallet(chainId, owner, profileMessage({ ...content, wallet, signedAt }), signature as Hex))) {
    return NextResponse.json({ error: 'That signature does not match this profile.' }, { status: 403 });
  }

  if (isEmptyProfile(content)) store.remove(wallet);
  else store.put({ ...content, wallet, signedAt, signature });
  return NextResponse.json({ profile: isEmptyProfile(content) ? null : store.get(wallet) });
}
