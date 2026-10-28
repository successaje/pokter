import { NextResponse } from 'next/server';
import { isAddress, isHex, type Address, type Hex } from 'viem';

import { briefMessage, parseBriefContent, type Brief } from '@/lib/briefs/model';
import { getBriefStore } from '@/lib/briefs/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';
import { signedByWallet, walletCanBeChecked } from '@/lib/wallet/signed-by';

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
  if (poster !== null && !isAddress(poster)) return NextResponse.json({ error: 'poster must be a wallet address.' }, { status: 400 });
  const briefs = poster ? store.byPoster(poster) : store.all();
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

  const brief: Brief = {
    ...content,
    id: crypto.randomUUID(),
    poster: poster as Address,
    signature: signature as Hex,
    state: 'open',
    postedAt,
    awardedBidId: null,
  };
  getBriefStore().add(brief);
  return NextResponse.json({ brief }, { status: 201 });
}
