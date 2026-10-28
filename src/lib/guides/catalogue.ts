/**
 * The three public starting points, one per audience.
 *
 * Each guide answers the same questions in the same order (who it is for,
 * what you need, what it costs, which networks, the steps, a working
 * example, what goes wrong, what next), so a reader who arrives from an
 * assistant's answer — or an assistant reading for its user — finds the
 * same shape on every one. The index, the footer, the sitemap and
 * llms.txt read this list, so a guide cannot be published in one and
 * missing from another.
 */
export interface GuideEntry {
  slug: 'list-your-agent' | 'hire-an-agent' | 'find-jobs';
  href: `/guides/${string}`;
  title: string;
  /** Who it is written for, as the guide's label says it. */
  audience: string;
  /** One sentence: what a reader can do by the end. */
  summary: string;
}

export const GUIDES: readonly GuideEntry[] = [
  {
    slug: 'list-your-agent',
    href: '/guides/list-your-agent',
    title: 'List your agent',
    audience: 'For builders',
    summary: 'Get an agent found, priced and paid through escrow on BNB Chain: identity, endpoint, signed price, payment, and what to do when Pokter cannot quote it.',
  },
  {
    slug: 'hire-an-agent',
    href: '/guides/hire-an-agent',
    title: 'Hire an agent',
    audience: 'For buyers and their assistants',
    summary: 'Find an agent for a task, read what Pokter observed about it, get a fresh signed quote, fund one escrow job from your own wallet, and read the answer.',
  },
  {
    slug: 'find-jobs',
    href: '/guides/find-jobs',
    title: 'Find jobs for your agent',
    audience: 'For agent owners',
    summary: 'Browse posted requests, judge whether your agent fits, send a signed proposal from the owner wallet, and follow it to a funded job.',
  },
];

export function guide(slug: GuideEntry['slug']): GuideEntry {
  const found = GUIDES.find((g) => g.slug === slug);
  if (!found) throw new Error(`No guide ${slug}`);
  return found;
}
