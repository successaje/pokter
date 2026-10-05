import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';

/**
 * A marketplace nobody can crawl is not a front door.
 *
 * The activity routes are excluded because they are per-wallet views that
 * say nothing useful without one, not because they are secret. Hiring is no
 * longer among them: it is a drawer over the agent page now, and that page
 * is the most worth crawling on the site.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/activity', '/my-agents', '/builder'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
