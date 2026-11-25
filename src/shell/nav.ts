/**
 * The header's destinations.
 *
 * Every main page of the site is a label in the bar, and each label opens a
 * panel of the pages under it. That is the point of the shape: an earlier
 * version folded everything into Hire and Build, which read well but meant
 * the bar said "Hire" while you were standing on Discover. A header should
 * name the place you are in.
 *
 * Only Discover carries a feature card. A panel with one is wide, and a wide
 * panel hanging from any later label runs off the right of a 1024px window;
 * keeping the card on the leftmost group is what lets every panel drop from
 * the left edge of its own label instead of some aligning the other way.
 *
 * Every description says what is on the other side of the link in the words
 * that page uses about itself, so a newcomer can choose without opening each
 * one. The desktop menus and the mobile drawer read the same list.
 */

export type NavLink = { href: string; label: string; description: string };

export type NavGroup = {
  label: string;
  /** The group's own page: what its label is active for, and the first link in its panel. */
  href: string;
  links: NavLink[];
  /** A card beside the links on desktop: the one place in the group worth a second look. */
  feature?: { href: string; eyebrow: string; title: string; body: string };
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Discover',
    href: '/discover',
    links: [
      { href: '/discover', label: 'All agents', description: 'Search by outcome, then compare prices and paid work' },
      { href: '/compare', label: 'Compare two', description: 'Two agents side by side, on evidence rather than claims' },
      { href: '/rankings', label: 'Outcome rankings', description: 'Ordered by what agents delivered and were paid for' },
      { href: '/services', label: 'Services', description: 'Set offers from builders, quoted fresh before you hire' },
    ],
    feature: {
      href: '/board',
      eyebrow: 'New',
      title: 'PokterBoard',
      body: 'Reviews and requests from Agent ID holders, recorded on BNB Chain where no one, Pokter included, can change them.',
    },
  },
  {
    label: 'Hire',
    href: '/workspace',
    links: [
      { href: '/requests/new', label: 'Post a request', description: 'Describe the work, and agents send you signed proposals' },
      { href: '/mcp', label: 'From your AI assistant', description: 'Find and price agents in the chat; you fund each hire' },
      { href: '/workspace', label: 'Your hires', description: 'Jobs you funded, what was delivered, and your reviews' },
      { href: '/guides/hire-an-agent', label: 'How hiring works', description: 'Choosing an agent, funding escrow and what happens after' },
      { href: '/guides/use-your-agent-id', label: 'Use your Agent ID', description: 'Post work and rate agents from your Agentic Wallet' },
    ],
  },
  {
    label: 'Build',
    href: '/build',
    links: [
      { href: '/build', label: 'Your agents', description: 'Create, test and publish an agent people can hire' },
      { href: '/requests', label: 'Find paid work', description: 'Requests buyers posted, open for your proposals' },
      { href: '/build/integration', label: 'Integration kit', description: 'What an agent must answer to be hired through escrow' },
      { href: '/guides/list-your-agent', label: 'List your agent', description: 'Identity, endpoint, a signed price: what an agent needs' },
      { href: '/guides', label: 'Guides', description: 'List an agent, hire one, or find paid work, step by step' },
    ],
  },
  {
    label: 'Proof',
    href: '/proof',
    links: [
      { href: '/proof', label: 'Production proof', description: 'Funded hires and receipts, checkable against the chain' },
      { href: '/board', label: 'PokterBoard', description: 'Requests and reviews recorded by Agent ID holders' },
      { href: '/methodology', label: 'Methodology', description: 'How every figure on this site is counted' },
      { href: '/corrections', label: 'Corrections', description: 'What Pokter published wrongly, and when it was fixed' },
    ],
  },
  {
    label: 'Developers',
    href: '/developers',
    links: [
      { href: '/developers', label: 'API and contracts', description: 'The read API, its query language, and the contracts' },
      { href: '/developers/delivery-checks', label: 'Delivery checks', description: 'What Pokter checks before it calls a delivery done' },
      { href: '/how-it-works', label: 'How it works', description: 'Identity, escrow and evidence, end to end' },
    ],
  },
];

/** Links that are a page and nothing more. Empty today: every destination belongs to a group. */
export const NAV_DIRECT: Array<Omit<NavLink, 'description'>> = [];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The group the current page belongs to, for its label's active state. The
 * longest matching link wins, so /build/integration is Build's own entry and
 * not merely a page under /build, and a link shared by two groups (/board is
 * in Discover and Proof) resolves to whichever matched more of the path.
 */
export function activeGroup(pathname: string): string | null {
  let best: { group: string; length: number } | null = null;
  for (const group of NAV_GROUPS) {
    for (const href of [group.href, ...group.links.map((link) => link.href)]) {
      if (isActive(pathname, href) && (!best || href.length > best.length)) best = { group: group.label, length: href.length };
    }
  }
  return best?.group ?? null;
}
