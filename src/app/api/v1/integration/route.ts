import { NextResponse } from 'next/server';

import { originOf } from '@/lib/api/origin';
import { integrationKit } from '@/lib/integration/live';

/**
 * The integration kit as JSON, for a builder's script or agent. Read-only,
 * cacheable.
 *
 * The origin comes from the forwarded headers, not from `request.url`.
 * Behind the proxy that URL is the socket the container listens on, so
 * this route published every preflight link as `https://0.0.0.0:8080/…` —
 * `/build/import`, `POST /api/compatibility` and the agent API — on the
 * document the build prompt calls the only authority, and which a builder
 * is told to fetch before writing anything.
 *
 * The page at `/build/integration` was right the whole time because it
 * takes the default, so the two halves of "the same document" disagreed
 * and only the machine-readable half was wrong. `originOf` already exists
 * for exactly this failure — see the note on it — and this route simply
 * never adopted it.
 */
export function GET(request: Request): NextResponse {
  const kit = integrationKit(originOf(request));
  return NextResponse.json(kit, { headers: { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' } });
}
