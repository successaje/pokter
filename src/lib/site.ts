/**
 * The canonical origin, from the same variable the metadata base uses.
 *
 * Kept in one place so robots.txt, the sitemap and Open Graph URLs cannot
 * disagree about where this site lives — a mismatch there is invisible in
 * development and wrong in exactly the environment that matters.
 */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.NODE_ENV === 'production' ? 'https://pokter.xyz' : 'http://localhost:4311')
  ).replace(/\/$/, '');
}
