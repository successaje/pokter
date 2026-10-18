import { createAvatar } from '@dicebear/core';
import { rings } from '@dicebear/collection';

/**
 * A deterministic avatar for an agent that publishes no image.
 *
 * Generated here rather than fetched from api.dicebear.com. The hosted API
 * would put a third-party request on every card of every catalogue page —
 * someone else's uptime and rate limit in front of our own, and another host
 * to declare on the privacy page beside the publisher image hosts. The
 * library is the same code; only the origin changes, and this one is ours.
 *
 * Rings by DiceBear, CC0 1.0 (public domain):
 * https://creativecommons.org/publicdomain/zero/1.0/ — recorded here
 * because a licence nobody wrote down is a licence nobody can check.
 *
 * Abstract on purpose. This was Bottts, whose robots carry two eyes and a
 * mouth, and at the 40px a card actually renders them they read as cartoon
 * smileys — on a marketplace whose whole argument is that it is the serious
 * one. Before that it was a hand-drawn face generator that chose from six
 * palettes and handed the same picture to several agents on one page.
 *
 * Twice now the fault has been faces, so this has none: concentric bands,
 * which carry no expression and read as a seal rather than a character.
 * Of the face-free styles it also separates best at card size — its hues
 * run the full circle, where `shapes` clusters in the blues and `glass`
 * and `identicon` lose their variety against a dark background entirely.
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

  const svg = createAvatar(rings, {
    seed,
    size: 112,
    radius: 26,
    /*
     * A ground, because this style does not paint one.
     *
     * The note that stood here said rings ignores `backgroundColor` and
     * paints its own, so the option was dropped. It does neither: without
     * it the SVG is arcs on transparency, and `AvatarImage`'s `bg-sunken`
     * showed through everywhere the arcs are not — a grey rounded square
     * around a floating circle, which at 76px on the agent page read as a
     * broken image rather than an avatar. Checked by diffing the two
     * outputs: passing the option inserts
     * `<rect fill="…" width="100" height="100">` inside the mask.
     *
     * Mid-tone on purpose. One file is served to both themes — the URL is
     * immutable and cached for a year, and some agents registered it as
     * their on-chain image — so the ground has to sit on cream and on
     * near-black at once. These read on both, and against the style's own
     * pastel arcs.
     *
     * Still one per seed, so eight agents in a grid are still told apart
     * by hue. That part of the old note was right.
     */
    backgroundColor: ['3f4a52', '4a4036', '38474a', '4a3a44', '424a38', '343c4a'],
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
