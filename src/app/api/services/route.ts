import { NextResponse } from 'next/server';
import { getAddress, isAddress, isHex, type Hex } from 'viem';
import { getProfileStore } from '@/lib/profiles/store';
import { registryOwner } from '@/lib/registry/onchain';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { parseService, serviceMessage } from '@/lib/services/model';
import { getServiceStore } from '@/lib/services/store';
import { signedByWallet, walletCanBeChecked } from '@/lib/wallet/signed-by';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const builder = params.get('builder');
  if (builder && !isAddress(builder)) return NextResponse.json({ error: 'Invalid builder.' }, { status: 400 });
  const result = builder ? { items: getServiceStore().byBuilder(builder).filter((s) => s.status === 'active'), total: 0 }
    : getServiceStore().list({ q: params.get('q')?.slice(0, 100), category: params.get('category') ?? undefined, chainId: Number(params.get('network')) || undefined, limit: 24, offset: Math.max(0, Number(params.get('offset')) || 0) });
  return NextResponse.json({ services: result.items, total: builder ? result.items.length : result.total });
}

export async function POST(request: Request) {
  const rate = consumeRateLimit(`service-write:${requestClientKey(request)}`, { limit: 8, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many changes. Try again shortly.' }, { status: 429 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const builder = String(body?.builder ?? '');
  const signature = String(body?.signature ?? '');
  const challengeId = String(body?.challengeId ?? '');
  const id = body?.id === null ? null : String(body?.id ?? '');
  const content = parseService(body?.content);
  if (!isAddress(builder) || !isHex(signature) || !content || (id !== null && !/^[0-9a-f-]{36}$/.test(id)))
    return NextResponse.json({ error: 'Invalid service details.' }, { status: 400 });
  const owner = getAddress(builder);
  const profile = getProfileStore().get(owner);
  if (!profile?.published || !profile.showBuilding)
    return NextResponse.json({ error: 'Publish your builder profile and enable Building first.' }, { status: 403 });
  const suffix = getProfileStore().challenge(challengeId, owner, content.chainId);
  if (!suffix) return NextResponse.json({ error: 'This signing challenge expired or was used.' }, { status: 409 });
  if (!(await walletCanBeChecked(content.chainId, owner, signature as Hex)))
    return NextResponse.json({ error: 'This smart wallet is not active on the selected network yet.' }, { status: 409 });
  if (!(await signedByWallet(content.chainId, owner, serviceMessage(owner, suffix, id, content), signature as Hex)))
    return NextResponse.json({ error: 'The builder signature is invalid.' }, { status: 403 });
  const registry = await registryOwner(content.chainId, content.tokenId).catch(() => null);
  if (!registry) return NextResponse.json({ error: 'Registry ownership could not be checked.' }, { status: 503 });
  if (registry !== owner) return NextResponse.json({ error: 'This wallet no longer owns that agent.' }, { status: 409 });
  if (!getProfileStore().consumeChallenge(challengeId)) return NextResponse.json({ error: 'This signing challenge was used.' }, { status: 409 });
  try { return NextResponse.json({ service: getServiceStore().save(id, owner, content) }, { status: id ? 200 : 201 }); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 409 }); }
}
