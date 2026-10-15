import { NextResponse } from 'next/server';

import { integrationKit } from '@/lib/integration/live';

/** The integration kit as JSON, for a builder's script or agent. Read-only, cacheable. */
export function GET(request: Request): NextResponse {
  const kit = integrationKit(new URL(request.url).origin);
  return NextResponse.json(kit, { headers: { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' } });
}
