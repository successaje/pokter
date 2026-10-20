import { NextResponse } from 'next/server';
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem';

import { isEmptyProfile, PROFILE_EDIT_WINDOW_MS, profileContentOf, profileMessage, readProfileContent } from '@/lib/profiles/model';
import { getProfileStore } from '@/lib/profiles/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { registryOwner } from '@/lib/registry/onchain';
import { signedByWallet, walletCanBeChecked } from '@/lib/wallet/signed-by';

export const dynamic = 'force-dynamic';

/**
 * A wallet's published profile, and whether it has one at all. A profile
 * that is not published comes back as `published: null`: its content is
 * private, and only its owner can read it, by signing (`/draft`).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`profile-read:${requestClientKey(request)}`, { limit: 60, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests just now.' }, { status: 429 });
  const wallet = new URL(request.url).searchParams.get('wallet') ?? '';
  if (!isAddress(wallet)) return NextResponse.json({ error: 'A wallet address is required.' }, { status: 400 });
  const profile = getProfileStore().get(wallet);
  return NextResponse.json({ exists: Boolean(profile), published: profile?.published ? profileContentOf(profile) : null });
}

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

  if (store.handleTaken(content.handle, wallet)) {
    return NextResponse.json({ error: `@${content.handle} is taken. Choose another handle.` }, { status: 409 });
  }
  if (content.avatar && !store.avatar(content.avatar)) {
    return NextResponse.json({ error: 'That picture was not found. Upload it again.' }, { status: 400 });
  }

  /*
   * Every agent put on the profile must be this wallet's now, by the
   * registry itself. If the registry cannot be read, nothing is saved:
   * "could not check" must never be recorded as either answer.
   */
  const owners = await Promise.all(content.agents.map((key) => {
    const [chain, token] = key.split(':');
    return registryOwner(Number(chain), token).catch(() => null);
  }));
  if (owners.some((o) => o === null)) {
    return NextResponse.json({ error: 'Ownership check unavailable: the registry did not answer. Nothing was saved; try again shortly.' }, { status: 503 });
  }
  const notOwned = content.agents.filter((_, i) => owners[i] !== owner);
  if (notOwned.length > 0) {
    return NextResponse.json({ error: `This wallet does not own ${notOwned.map((k) => `#${k.split(':')[1]}`).join(', ')} in the registry, so it cannot be shown as yours.` }, { status: 409 });
  }

  if (isEmptyProfile(content)) store.remove(wallet);
  else store.put({ ...content, wallet, signedAt, signature });
  return NextResponse.json({ profile: isEmptyProfile(content) ? null : store.get(wallet) });
}
