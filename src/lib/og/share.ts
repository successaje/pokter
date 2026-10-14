import type { Metadata } from 'next';

/**
 * The title and description a shared link shows.
 *
 * Next merges metadata shallowly: a page that sets only `title` inherits
 * the root layout's whole `openGraph` and `twitter` objects, titles
 * included. So every page posted to X or Discord read "Most agents never
 * answer. These do." over its own card. A page that wants its own words
 * on the preview has to set both objects, and in full, because setting
 * either replaces the root's rather than adding to it.
 */
export function shareMetadata({ title, description }: { title: string; description: string }): Pick<Metadata, 'openGraph' | 'twitter'> {
  return {
    openGraph: { type: 'website', siteName: 'Pokter', title, description },
    twitter: { card: 'summary_large_image', site: '@usepokter', creator: '@usepokter', title, description },
  };
}
