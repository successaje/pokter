import 'server-only';

import { NextResponse } from 'next/server';

import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

/**
 * Shared behaviour for the public read API.
 *
 * CORS is open because the whole point is that anything can read it — an agent
 * shopping for another agent has no origin to allow-list. Only GET is exposed,
 * so an open policy grants nothing a caller could not get with curl.
 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
} as const;

export function apiJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...CORS,
      /*
       * Short and shared. The underlying data moves on a sweep cycle, not per
       * request, so a caller polling every second should be served a cached
       * copy rather than made to feel fast while costing a registry lookup.
       */
      'cache-control': 'public, max-age=30, s-maxage=30, stale-while-revalidate=120',
    },
  });
}

export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: CORS });
}

export function apiOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Returns a 429 response when the caller has run out, or null to proceed. */
export function apiRateLimit(
  request: Request,
  scope: string,
  limit = 60,
): NextResponse | null {
  const rate = consumeRateLimit(`api:${scope}:${requestClientKey(request)}`, {
    limit,
    windowMs: 60_000,
  });
  if (rate.allowed) return null;
  return NextResponse.json(
    { error: 'Rate limit exceeded.', retryAfterSeconds: rate.retryAfterSeconds },
    {
      status: 429,
      headers: { ...CORS, 'retry-after': String(rate.retryAfterSeconds) },
    },
  );
}

/** The origin a caller reached us on, for building absolute links. */
export function originOf(request: Request): string {
  return new URL(request.url).origin;
}
