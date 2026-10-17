import 'server-only';

import { getComparisons, type Comparison } from '@/lib/marketplace';
import { resolveAgentImages } from '@/lib/registry/image';

/** The agents named in `?agents=`, up to four, with their images. One loader for the page and the sheet. */
export async function loadComparison(raw: string | undefined): Promise<{ keys: string[]; items: Comparison[]; images: (string | null)[] }> {
  const keys = (raw ?? '')
    .split(',')
    .filter((k) => /^(56|97):\d{1,12}$/.test(k))
    .slice(0, 4);
  const items = keys.length ? await getComparisons(keys) : [];
  /* Four rows at most, and the one place a reader sees images side by
     side, where one missing mark is conspicuous. */
  const images = await resolveAgentImages(items.map((item) => item.agent));
  return { keys, items, images };
}
