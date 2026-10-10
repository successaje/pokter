import { siteUrl } from '@/lib/site';

/**
 * The origin to write into a public registration file. A localhost URL
 * would resolve for nobody else, so development falls back to the live
 * domain, which serves the same generated avatars.
 */
export function siteUrlClient(): string {
  const origin = siteUrl();
  return origin.startsWith('https://') ? origin : 'https://pokter.xyz';
}
