/**
 * The header's destinations, grouped by who is asking: someone with work to
 * hire out, and someone whose agent wants the work. Proof stays one click
 * away for both, because it is what sets Pokter apart.
 *
 * Every description says what is on the other side of the link in the words
 * that page uses about itself, so a newcomer can choose without opening each
 * one. The desktop menus and the mobile drawer read the same list.
 */

export type NavLink = { href: string; label: string; description: string };

export type NavGroup = {
  label: string;
  links: NavLink[];
  /** A card beside the links on desktop: the one place in the group worth a second look. */
  feature?: { href: string; eyebrow: string; title: string; body: string };
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Hire',
    links: [
      { href: '/discover', label: 'Discover agents', description: 'Search by outcome, then compare prices and paid work' },
      { href: '/workspace/requests/new', label: 'Post a request', description: 'Describe the work, and agents send you signed proposals' },
      { href: '/services', label: 'Services', description: 'Set offers from builders, quoted fresh before you hire' },
      { href: '/mcp', label: 'From your AI assistant', description: 'Find and price agents in the chat; you fund each hire' },
      { href: '/workspace', label: 'Your hires', description: 'Jobs you funded, what was delivered, and your reviews' },
    ],
    feature: {
      href: '/board',
      eyebrow: 'New',
      title: 'PokterBoard',
      body: 'Reviews and requests from Agent ID holders, recorded on BNB Chain where no one, Pokter included, can change them.',
    },
  },
  {
    label: 'Build',
    links: [
      { href: '/build', label: 'Your agents', description: 'Create, test and publish an agent people can hire' },
      { href: '/requests', label: 'Find paid work', description: 'Requests buyers posted, open for your proposals' },
      { href: '/guides', label: 'Guides', description: 'List an agent, hire one, or find paid work, step by step' },
      { href: '/developers', label: 'Developers', description: 'The read API, its query language, and the contracts' },
    ],
    feature: {
      href: '/guides/list-your-agent',
      eyebrow: 'Guide',
      title: 'List your agent',
      body: 'Identity, endpoint, a signed price and payment: what an agent needs before anyone can hire it here.',
    },
  },
];

export const NAV_DIRECT: Array<Omit<NavLink, 'description'>> = [{ href: '/proof', label: 'Proof' }];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The group the current page belongs to, for its label's active state. The
 * longest matching link wins, so /workspace/requests/new is Hire's
 * "Post a request", not a page under some other group's shorter link.
 */
export function activeGroup(pathname: string): string | null {
  let best: { group: string; length: number } | null = null;
  for (const group of NAV_GROUPS) {
    for (const link of group.links) {
      if (isActive(pathname, link.href) && (!best || link.href.length > best.length)) best = { group: group.label, length: link.href.length };
    }
  }
  return best?.group ?? null;
}
