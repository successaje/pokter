import { FooterAssembly } from './FooterAssembly';
import Link from 'next/link';

import { GUIDES } from '@/lib/guides/catalogue';
import { SUPPORT_EMAIL } from '@/lib/support/contact';
import { Mark } from './Logo';

const GROUPS: Array<{ title: string; links: Array<{ href: string; label: string; external?: boolean }> }> = [
  {
    title: 'Product',
    links: [
      { href: '/discover', label: 'Discover agents' },
      { href: '/requests', label: 'Requests' },
      { href: '/compare', label: 'Compare' },
      { href: '/watch', label: 'Venus liquidation alerts' },
      { href: '/proof', label: 'Production proof' },
      { href: '/rankings', label: 'Outcome rankings' },
      { href: '/leaderboard', label: 'Leaderboard' },
      { href: '/workspace', label: 'Hiring' },
      { href: '/build', label: 'Build an agent' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { href: '/connect', label: 'Connect your assistant' },
      { href: '/developers', label: 'Overview' },
      { href: '/developers#api', label: 'Public API' },
      { href: '/developers#protocols', label: 'Protocols' },
      { href: '/evaluators', label: 'Evaluators' },
      { href: '/evaluators/challenge', label: 'Evaluation challenge' },
      //{ href: GITHUB_REPO_URL, label: 'Source code', external: true },
    ],
  },
  {
    title: 'Resources',
    links: [
      /* The three starting points first: they are where somebody new, or an assistant reading for them, should land. */
      ...GUIDES.map((g) => ({ href: g.href, label: g.title })),
      { href: '/how-it-works', label: 'How it works' },
      { href: '/methodology', label: 'Methodology' },
      { href: '/corrections', label: 'Where we were wrong' },
      { href: '/agent-advantage', label: 'Agent vs by hand' },
      { href: '/support', label: 'Help and support' },
      { href: '/set-and-earn', label: 'Set and Earn campaign' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: 'https://x.com/usepokter', label: 'X (@usepokter)', external: true },
      { href: `mailto:${SUPPORT_EMAIL}`, label: 'Contact', external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/terms', label: 'Terms' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/risk', label: 'Risk disclosures' },
    ],
  },
];

/**
 * A ledger, not a second hero: five columns under a single rule, closed by
 * a line that states the relationship to BNB Chain exactly as far as it
 * goes and no further.
 */
export function SiteFooter() {
  return (
    <footer className="group/footer mt-24 border-t border-rule bg-sunken/60 pb-16 md:pb-0">
      <div className="frame grid grid-cols-1 gap-12 py-14 lg:grid-cols-[1.1fr_3fr]">
        <div className="flex max-w-xs flex-col gap-4">
          <span className="inline-flex items-center gap-2.5 text-ink">
            <Mark size={22} />
            <span className="text-[17px] font-[640] tracking-[-0.03em]">Pokter</span>
          </span>
          <p className="text-sm leading-relaxed text-ink-2">
            {/*
              Not the hero's line. "These do" points at a catalogue, and
              there is no catalogue under a footer — the sentence needs to
              stand on its own here, so it states the work rather than the
              finding.
            */}
            We call the BNB Chain agents working in the categories we judge,
            and publish what came back — including the ones that never answer.
            Evidence first, one escrow per job, no standing access to your
            wallet.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <h2 className="t-label">{group.title}</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {group.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a href={link.href} className="text-ink-2 hover:text-ink" target={link.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer noopener">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="text-ink-2 hover:text-ink">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <FooterAssembly />
      {/* No rule: the wordmark's own baseline is the division already. */}
      <div>
        <div className="frame flex flex-col gap-2 pb-7 pt-6 text-[12.5px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>An independent agent marketplace built on BNB Chain. Not operated or endorsed by BNB Chain.</p>
          <p className="t-readout">ERC-8004 · ERC-8183 · A2A · MCP</p>
        </div>
      </div>
    </footer>
  );
}

/**
 * One line: who this is, the few links a reader is actually looking for at
 * the bottom of a working page, and the standing disclosure.
 *
 * The five-column version is a destination in itself and belongs under the
 * landing page, where somebody is deciding whether to use Pokter at all.
 * Under a catalogue, a dossier or a job it was a second page of navigation
 * plus a screen-high wordmark, below content the reader came for.
 *
 * The BNB Chain sentence stays in both. It is a statement about who
 * operates this and who does not, and it does not get shorter because the
 * page did.
 */
export function CompactFooter() {
  /*
   * Short, but not so short that something becomes unreachable. The header
   * carries Discover, Requests, Hiring, Building, Proof and Developers; everything
   * else only ever had the footer, so cutting to a line meant deciding what
   * a reader can still get to from a page deep in the catalogue.
   *
   * Rankings and the risk disclosures are here for that reason and not for
   * balance. Neither is in the header, and a page where somebody funds an
   * escrow is the last place to make the risk disclosures hard to find.
   */
  const links = [
    { href: '/agents', label: 'All agents' },
    { href: '/requests', label: 'Requests' },
    /* The three starting points, from every page: the full footer, which lists each, is on the home page only. */
    { href: '/guides', label: 'Guides' },
    { href: '/how-it-works', label: 'How it works' },
    { href: '/methodology', label: 'Methodology' },
    { href: '/rankings', label: 'Outcome rankings' },
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/support', label: 'Support' },
    { href: '/terms', label: 'Terms' },
    { href: '/privacy', label: 'Privacy' },
    { href: '/risk', label: 'Risk' },
  ];
  return (
    <footer className="mt-20 border-t border-rule bg-sunken/60 pb-16 md:pb-0">
      <div className="frame flex flex-col gap-5 py-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/" className="inline-flex items-center gap-2 text-ink">
            <Mark size={18} />
            <span className="text-[15px] font-[640] tracking-[-0.03em]">Pokter</span>
          </Link>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="text-ink-2 hover:text-ink">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-2 text-[12px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>An independent agent marketplace built on BNB Chain. Not operated or endorsed by BNB Chain.</p>
          <p className="t-readout">ERC-8004 · ERC-8183 · A2A · MCP</p>
        </div>
      </div>
    </footer>
  );
}
