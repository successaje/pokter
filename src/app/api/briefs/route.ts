import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { isAddress, isHex, type Address, type Hex } from 'viem';

import { briefMessage, parseBriefContent, type Brief } from '@/lib/briefs/model';
import { getBriefStore } from '@/lib/briefs/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { signedByWallet, walletCanBeChecked } from '@/lib/wallet/signed-by';
import { getProfileStore } from '@/lib/profiles/store';
import { notifyBuilderCustomRequest } from '@/lib/notifications/server';
import { verifiedOwnedAgents } from '@/lib/profiles/owned-agents';

export const dynamic = 'force-dynamic';

/**
 * Every request, or one wallet's (`?poster=`), each with its bid count.
 *
 * A poster's requests are already public on /requests; this only filters
 * them, for the Hiring view's "My requests".
 */
export async function GET(request: Request): Promise<NextResponse> {
  const store = getBriefStore();
  const poster = new URL(request.url).searchParams.get('poster');
  const target = new URL(request.url).searchParams.get('target');
  if (poster !== null && !isAddress(poster)) return NextResponse.json({ error: 'poster must be a wallet address.' }, { status: 400 });
  if (target !== null && !isAddress(target)) return NextResponse.json({ error: 'target must be a wallet address.' }, { status: 400 });
  const briefs = target ? store.byTarget(target) : poster ? store.byPoster(poster) : store.all();
  return NextResponse.json({ briefs: briefs.map((brief) => ({ ...brief, bids: store.bidsFor(brief.id).length })) });
}

/**
 * Post a brief, signed by whoever is asking.
 *
 * The signature is the whole point. Pokter stores the brief but does not
 * vouch for it; what a builder can check is that the wallet named on it
 * signed these exact terms, so acceptance criteria cannot be widened after
 * somebody has bid on them.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`brief:${requestClientKey(request)}`, { limit: 5, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many briefs just now. Try again shortly.' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const poster = String(body.poster ?? '');
  const signature = String(body.signature ?? '');
  const postedAt = String(body.postedAt ?? '');
  const read = parseBriefContent(body.content);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
  const content = read.content;
  if (content.targetBuilder) {
    const target = getProfileStore().get(content.targetBuilder);
    if (!target?.published || !target.showBuilding) return NextResponse.json({ error: 'This builder is no longer accepting public requests.' }, { status: 409 });
    if ((await verifiedOwnedAgents(content.targetBuilder)).length === 0) return NextResponse.json({ error: 'This builder has no currently owned agent that can propose. Nothing was posted.' }, { status: 409 });
  }
  if (!isAddress(poster) || !isHex(signature) || Number.isNaN(Date.parse(postedAt))) {
    return NextResponse.json({ error: 'The brief payload is invalid.' }, { status: 400 });
  }

  /* A counterfactual wallet cannot prove anything, and "invalid signature"
     would send somebody hunting for a wallet they do not have. */
  if (!(await walletCanBeChecked(content.chainId, poster as Address, signature as Hex))) {
    return NextResponse.json(
      { error: 'This wallet has no code on chain yet, so its signature cannot be checked. Fund or deploy it first.' },
      { status: 409 },
    );
  }

  const message = briefMessage({ ...content, poster, postedAt });
  if (!(await signedByWallet(content.chainId, poster as Address, message, signature as Hex))) {
    return NextResponse.json({ error: 'That signature does not match this brief.' }, { status: 403 });
  }

  const digest = createHash('sha256').update(message).digest('hex');
  const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const existing = getBriefStore().get(id);
  if (existing) return NextResponse.json({ brief: existing, duplicate: true }, { status: 200 });
  const brief: Brief = {
    ...content,
    id,
    poster: poster as Address,
    signature: signature as Hex,
    state: 'open',
    postedAt,
    awardedBidId: null,
  };
  try { getBriefStore().add(brief); }
  catch (error) {
    const prior = getBriefStore().get(id);
    if (prior) return NextResponse.json({ brief: prior, duplicate: true }, { status: 200 });
    throw error;
  }
  if (content.targetBuilder) await notifyBuilderCustomRequest({ owner: content.targetBuilder, requestId: brief.id, chainId: brief.chainId, title: brief.title }).catch(() => undefined);
  return NextResponse.json({ brief }, { status: 201 });
}
