import { createAvatar } from '@dicebear/core';
import { bottts } from '@dicebear/collection';

/**
 * A deterministic avatar for an agent that publishes no image.
 *
 * Generated here rather than fetched from api.dicebear.com. The hosted API
 * would put a third-party request on every card of every catalogue page —
 * someone else's uptime and rate limit in front of our own, and another host
 * to declare on the privacy page beside the publisher image hosts. The
 * library is the same code; only the origin changes, and this one is ours.
 *
 * Bottts by Pablo Stanley, free for personal and commercial use:
 * https://bottts.com/ — no attribution required, but it is recorded here
 * because a licence nobody wrote down is a licence nobody can check.
 *
 * Replaces a hand-drawn face generator that chose from six palettes and so
 * handed the same picture to several agents on one page, which is the one
 * thing an avatar in a list has to avoid.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ seed: string }> },
) {
  const { seed: rawSeed } = await context.params;
  /*
   * Narrowed before use. The seed reaches the generator and the cache key,
   * and an unbounded path segment is not something to hand either.
   */
  const seed =
    rawSeed.slice(0, 80).replace(/[^a-zA-Z0-9_-]/g, '') || 'pokter-agent';

  const svg = createAvatar(bottts, {
    seed,
    size: 112,
    radius: 26,
    /*
     * Tinted to the product rather than left on the library's defaults,
     * which are mid-tone pastels that sit oddly on a near-black surface.
     * The faces keep their own colours — that variety is what distinguishes
     * one agent from the next.
     */
    backgroundColor: ['24241f', '1c1c14', '2c2c26'],
  }).toString();

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      /* Deterministic for a given seed, so it can be cached indefinitely. */
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
