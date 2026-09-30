import { NextResponse } from 'next/server';

import { listSearchable } from '@/lib/marketplace';
import { verdictFor } from '@/lib/search/match';
import { consumeRateLimit, requestClientKey } from '@/lib/security/rate-limit';

export async function POST(request: Request): Promise<NextResponse> {
  const rate = consumeRateLimit(`saved-check:${requestClientKey(request)}`, { limit: 12, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Saved-agent check limit reached.' }, { status: 429 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 }); }
  const raw = Array.isArray(body.agents) ? body.agents : [];
  const requested = raw.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    const chainId = Number(item.chainId); const tokenId = String(item.tokenId ?? '');
    return (chainId === 56 || chainId === 97) && /^\d+$/.test(tokenId) ? [{ chainId, tokenId }] : [];
  }).slice(0, 50);
  if (!requested.length) return NextResponse.json({ snapshots: [] });

  const wanted = new Set(requested.map((item) => `${item.chainId}:${item.tokenId}`));
  const all = await listSearchable({ limit: 100 });
  const checkedAt = new Date().toISOString();
  const snapshots = all.filter(({ listing }) => wanted.has(`${listing.agent.chain_id}:${listing.agent.token_id}`)).map((entry) => {
    const recent = entry.record.windows.find((window) => window.label === '24h');
    const quote = entry.listing.quote;
    const currentPrice = quote && (!quote.expiresAt || Date.parse(quote.expiresAt) > Date.now()) ? quote.priceU : null;
    return {
      chainId: entry.listing.agent.chain_id,
      tokenId: entry.listing.agent.token_id,
      evidence: verdictFor(entry),
      response: !recent || recent.probes === 0 ? 'unmeasured' : recent.answered > 0 ? 'responding' : 'not-responding',
      priceU: currentPrice,
      checkedAt,
    };
  });
  return NextResponse.json({ snapshots, missing: requested.length - snapshots.length });
}
