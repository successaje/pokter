import { NextResponse } from 'next/server';

import { webScoutAnswer } from '@/lib/scout/web-answer';
import { parseScoutRequest } from '@/lib/scout/web-chat';
import { requestClientKey } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';
/* The model has 5.5 seconds; registry reads and a catalogue search sit in front of it. */
export const maxDuration = 20;

/**
 * Ask Scout, from the chat window on any page.
 *
 * JSON only, which a browser cannot send from another site without asking
 * first, and this route never answers that ask: another site's page cannot
 * spend Scout's quota through its visitors. Nothing about the conversation
 * is stored or logged; the rate-limit counter is keyed by the client
 * address and cleared within the hour.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 415 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }
  const parsed = parseScoutRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const outcome = await webScoutAnswer(parsed.value, requestClientKey(request));
  if (!outcome.ok) {
    return NextResponse.json(
      { error: 'Scout has answered a lot of questions from here. Try again shortly.', retryAfterSeconds: outcome.retryAfterSeconds },
      { status: 429, headers: { 'retry-after': String(outcome.retryAfterSeconds) } },
    );
  }
  return NextResponse.json(outcome.value, { headers: { 'cache-control': 'no-store' } });
}
