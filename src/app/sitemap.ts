import type { MetadataRoute } from 'next';

import { listMarketplace } from '@/lib/marketplace';
import { CATEGORIES } from '@/lib/agents/categories';
import { siteUrl } from '@/lib/site';

/**
 * Static routes plus every indexed agent.
 *
 * Agent pages are the reason this exists: they are the only pages carrying
 * evidence about a specific agent, and without a sitemap nothing outside
 * Pokter can find them.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const fixed = [
    { path: '', priority: 1 },
    { path: '/discover', priority: 0.9 },
    { path: '/how-it-works', priority: 0.8 },
    { path: '/methodology', priority: 0.8 },
    { path: '/build', priority: 0.7 },
    { path: '/developers', priority: 0.7 },
    { path: '/compare', priority: 0.5 },
    { path: '/set-and-earn', priority: 0.6 },
    { path: '/about', priority: 0.5 },
    { path: '/support', priority: 0.4 },
    { path: '/terms', priority: 0.3 },
    { path: '/privacy', priority: 0.3 },
    { path: '/risk', priority: 0.4 },
  ].map((entry) => ({
    url: `${base}${entry.path}`,
    lastModified: now,
    priority: entry.priority,
  }));

  const categories = CATEGORIES.map((category) => ({
    url: `${base}/discover?category=${category.id}`,
    lastModified: now,
    priority: 0.6,
  }));

  /*
   * A failure here must not take the sitemap down with it. An empty agent
   * list still leaves a valid document listing every static route, which is
   * strictly better than the 404 this replaces.
   */
  let agents: MetadataRoute.Sitemap = [];
  try {
    const sections = await listMarketplace({ limit: 60 });
    agents = sections
      .flatMap((section) => section.listings)
      .map((listing) => ({
        url: `${base}/agents/${listing.agent.chain_id}/${listing.agent.token_id}`,
        lastModified: now,
        priority: 0.8,
      }));
  } catch {
    agents = [];
  }

  const seen = new Set<string>();
  return [...fixed, ...categories, ...agents].filter((entry) =>
    seen.has(entry.url) ? false : (seen.add(entry.url), true),
  );
}
