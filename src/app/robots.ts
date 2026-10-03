import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';

/**
 * A marketplace nobody can crawl is not a front door.
 *
 * The hire and activity routes are excluded because they are per-wallet views
 * that say nothing useful without one, not because they are secret.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/hire/', '/my-agents', '/activity'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
