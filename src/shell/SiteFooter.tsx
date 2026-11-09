// The animated footer band is paused while the mark sits with the brand copy.
// import { FooterAssembly } from './FooterAssembly';
import Link from 'next/link';

import { GUIDES } from '@/lib/guides/catalogue';
import { POKTER_SOCIAL_LINKS } from '@/lib/social/links';
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
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: POKTER_SOCIAL_LINKS.x, label: 'X (@usepokter)', external: true },
      { href: POKTER_SOCIAL_LINKS.telegram, label: 'Telegram (Scout)', external: true },
      { href: POKTER_SOCIAL_LINKS.discord, label: 'Discord', external: true },
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
 * A ledger, not a second hero: five columns, closed by a line that states
 * the relationship to BNB Chain exactly as far as it goes and no further.
 *
 * The page closes on one block of brand colour, the index and the name,
 * drawn as a ruler with ticks along its top and its foot. The yellow is the
 * footer's alone: the ask above it stays on paper with the evidence. It does
 * not change with the theme, so neither does this.
 */
export function SiteFooter() {
  return (
    <footer className="pb-16 md:pb-0">
      <div aria-hidden className="ruler">
        <div className="frame" />
      </div>
      <div className="bg-[var(--signal)] text-[var(--signal-ink)]">
        <div className="frame">
          {/*
            The index at a size meant to be read from, under labels set small:
            the links are what somebody scrolled this far for, and the labels
            only sort them.
          */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 pt-20 sm:grid-cols-3 sm:pt-24 lg:grid-cols-5">
            {GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-5">
                <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--signal-ink)]/60">{group.title}</h2>
                <ul className="flex flex-col gap-3 text-[16px] leading-snug sm:text-[17px]">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      {link.external ? (
                        <a href={link.href} className="footer-link" target={link.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer noopener">
                          {link.label}
                        </a>
                      ) : (
                        <Link href={link.href} className="footer-link">
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {/*
            The close, corner to corner with the ask: what Pokter is and who
            does not operate it on the left, small, and the name on the right,
            large, where the page runs out.
          */}
          <div className="mt-20 grid gap-12 pb-14 lg:mt-28 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
            <div className="flex max-w-md flex-col gap-4 text-[13px] leading-relaxed text-[var(--signal-ink)]/72">
              <p>
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
              <p>An independent agent marketplace built on BNB Chain. Not operated or endorsed by BNB Chain.</p>
            </div>
            <div className="flex flex-col items-start gap-6 lg:items-end">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--signal-ink)]/60">ERC-8004 · ERC-8183 · A2A · MCP</p>
              <Link
                href="/"
                aria-label="Pokter home"
                className="t-display-mark inline-flex items-center gap-[0.14em] rounded-[10px] text-[clamp(3.25rem,1.75rem+4.6vw,6.75rem)] leading-[0.82] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current"
              >
                <Mark size={96} className="h-[0.8em] w-[0.77em]" />
                <span>Pokter</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
      {/* <FooterAssembly /> */}
      <div aria-hidden className="ruler ruler-foot">
        <div className="frame" />
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
    { href: POKTER_SOCIAL_LINKS.telegram, label: 'Telegram' },
    { href: POKTER_SOCIAL_LINKS.discord, label: 'Discord' },
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
              link.href.startsWith('http') ? (
                <a key={link.href} href={link.href} target="_blank" rel="noreferrer noopener" className="text-ink-2 hover:text-ink">{link.label}</a>
              ) : (
                <Link key={link.href} href={link.href} className="text-ink-2 hover:text-ink">{link.label}</Link>
              )
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
