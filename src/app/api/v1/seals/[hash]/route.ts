import { apiError, apiOptions, apiRateLimit } from '@/lib/api/respond';
import { getSealStore } from '@/lib/seals/store';

export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return apiOptions();
}

/**
 * The exact bytes a seal committed to.
 *
 * Served as stored text rather than re-serialised JSON. A route that
 * parsed this and handed it back through `NextResponse.json` would
 * re-order keys and re-space the output, and the reader hashing what
 * they received would get a different answer from the one on chain —
 * through no fault of theirs, and with no way to tell whether Pokter had
 * cheated or the pipe had.
 *
 * Immutable once published, so it carries a long cache: the whole claim
 * is that these bytes never change.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const limited = apiRateLimit(request, 'seals');
  if (limited) return limited;

  const { hash } = await params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return apiError('A seal hash is 32 bytes of hex, as listed by /api/v1/seals.', 400);
  }

  const seal = getSealStore().byHash(hash.toLowerCase());
  if (!seal) {
    return apiError('No seal with that hash has been published.', 404);
  }

  return new Response(seal.text, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
      /* Stated in a header as well as the index, so a reader who fetched
         only this file still knows where its proof of time lives. */
      'x-seal-anchor': seal.anchor
        ? `${seal.anchor.chainId}:${seal.anchor.transactionHash}`
        : 'unanchored',
    },
  });
}
