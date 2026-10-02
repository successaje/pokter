/**
 * The generated-avatar URL, and the version that makes a restyle visible.
 *
 * `/api/avatars/[seed]` answers with `cache-control: immutable, max-age=1y`,
 * which is right for art that is a pure function of its seed — and wrong the
 * moment the function changes. The style moved from a hand-drawn face
 * generator to Bottts to Rings, each time behind the same URLs, so a browser
 * that had loaded the old art kept serving it for a year and the change
 * simply did not arrive. It looked like the deploy had not worked.
 *
 * Bumping this makes every URL new, so caches miss and the current art is
 * fetched. Change the style in the route, change this in the same commit.
 *
 * It is a query parameter rather than part of the path because these URLs
 * are not all ours to change: the builder studio writes one into the
 * ERC-8004 registry as an agent's published image, and those are on chain
 * and permanent. The route ignores the parameter, so every URL ever minted
 * keeps resolving — it just renders whatever the current style is, which has
 * always been true of them.
 */
export const AVATAR_ART_VERSION = 2;

export function avatarUrl(seed: string): string {
  return `/api/avatars/${encodeURIComponent(seed)}?v=${AVATAR_ART_VERSION}`;
}
