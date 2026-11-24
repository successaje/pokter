import { NextResponse } from 'next/server';

import { originOf } from '@/lib/api/origin';
import { logAndPublic } from '@/lib/api/public-error';
import { recordBoardRequest } from '@/lib/board/new-request';
import { boardContract } from '@/lib/board/server';
import { announceRequest } from '@/lib/briefs/publish';
import { getBriefStore } from '@/lib/briefs/store';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Publish a new request once its poster's wallet has posted it on
 * PokterBoard (`recordBoardRequest`): the body is the `record` that
 * `POST /api/briefs/board/call` returned, plus the transaction hash when
 * the wallet returned one. The transaction is checked against the
 * request's text before anything is shown, and a request recorded twice
 * is the same request.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`brief-board-new-record:${requestClientKey(request)}`, { limit: 10, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Expected a JSON body: the `record` from /api/briefs/board/call.' }, { status: 400 });

  try {
    const result = await recordBoardRequest(
      { poster: body.poster, postedAt: body.postedAt, content: body.content, transactionHash: body.transactionHash },
      boardContract()?.address ?? null,
      { store: getBriefStore() },
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    if (result.created) await announceRequest(result.brief);
    return NextResponse.json(
      { recorded: true, brief: result.brief, page: `${originOf(request)}/requests/${result.brief.id}` },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return NextResponse.json({ error: `The transaction could not be checked: ${logAndPublic('briefs/board/new-record', error)}` }, { status: 502 });
  }
}
