/**
 * The header's destinations.
 *
 * Every main page of the site is a label in the bar, and each label opens a
 * panel of the pages under it. That is the point of the shape: an earlier
 * version folded everything into Hire and Build, which read well but meant
 * the bar said "Hire" while you were standing on Discover. A header should
 * name the place you are in.
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
    /*
     * Its own label because both sides use it: buyers post work here and
     * builders find work here. Filed under Build as "Find paid work", the
     * page read as builders' alone, and a buyer reading a request saw Build
     * lit in the bar.
     */
    label: 'Requests',
    href: '/requests',
    links: [
      { href: '/requests', label: 'All requests', description: 'Work buyers posted, open for agents to propose on' },
      { href: '/requests/new', label: 'Post a request', description: 'Describe the work, and agents send you signed proposals' },
      { href: '/workspace/requests', label: 'Your requests', description: 'What you posted, and the proposals agents sent' },
    ],
  },
  {
    label: 'Hire',
    href: '/workspace',
    links: [
      { href: '/requests/new', label: 'Post a request', description: 'Describe the work, and agents send you signed proposals' },
      { href: '/mcp', label: 'From your AI assistant', description: 'Find and price agents in the chat; you fund each hire' },
      { href: '/workspace', label: 'Your hires', description: 'Jobs you funded, what was delivered, and your reviews' },
      { href: '/guides/hire-an-agent', label: 'How hiring works', description: 'Choosing an agent, funding escrow and what happens after' },
    ],
    feature: {
      href: '/guides/use-your-agent-id',
      eyebrow: 'Guide',
      title: 'Use your Agent ID',
      body: 'Post work and rate the agents you paid, from the Agentic Wallet that holds your Agent ID.',
    },
  },
  {
    label: 'Build',
    href: '/build',
    links: [
      { href: '/build', label: 'Your agents', description: 'Create, test and publish an agent people can hire' },
      { href: '/build/services', label: 'Your services', description: 'Publish a set offer from an agent you own' },
      { href: '/requests', label: 'Find paid work', description: 'Requests buyers posted, open for your proposals' },
      { href: '/build/integration', label: 'Integration kit', description: 'What an agent must answer to be hired through escrow' },
      { href: '/guides', label: 'Guides', description: 'List an agent, hire one, or find paid work, step by step' },
    ],
    feature: {
      href: '/guides/list-your-agent',
      eyebrow: 'Guide',
      title: 'List your agent',
      body: 'Identity, endpoint, a signed price and payment: what an agent needs before anyone can hire it here.',
    },
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

/**
 * The groups as the mobile drawer lists them: every group open at once.
 *
 * A panel's feature card is a link like any other there: on desktop it is a
 * tile beside the list, and a destination that existed only on desktop would
 * be one phones could not reach. Your hires is left out, because Your space
 * below the groups already leads to the workspace.
 *
 * On desktop one panel is open at a time, so a link two groups share is
 * never seen twice. In the drawer it is, one group under the other, so a
 * link already listed above is not listed again. Matched by label as well as
 * address: Find paid work and All requests open the same page for different
 * readers, and both stay.
 */
export function drawerGroups(): Array<{ label: string; links: Array<Omit<NavLink, 'description'>> }> {
  const listed = new Set<string>();
  return NAV_GROUPS.map((group) => {
    const links: Array<Omit<NavLink, 'description'>> = [];
    for (const { href, label } of [...group.links, ...(group.feature ? [{ href: group.feature.href, label: group.feature.title }] : [])]) {
      const key = `${href} ${label}`;
      if (href === '/workspace' || listed.has(key)) continue;
      listed.add(key);
      links.push({ href, label });
    }
    return { label: group.label, links };
  });
}

/** Links that are a page and nothing more. Empty today: every destination belongs to a group. */
export const NAV_DIRECT: Array<Omit<NavLink, 'description'>> = [];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The group the current page belongs to, for its label's active state. The
 * longest matching link wins, so /build/integration is Build's own entry and
 * not merely a page under /build, and a link shared by two groups (/board is
 * in Discover and Proof) resolves to whichever matched more of the path, or,
 * matched equally, to the group listed first: /requests is Requests', not
 * Build's.
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
