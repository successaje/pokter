import Link from 'next/link';

import { GITHUB_REPO_URL, SUPPORT_EMAIL } from '@/lib/support/contact';
import { Mark } from './Logo';

const GROUPS: Array<{ title: string; links: Array<{ href: string; label: string; external?: boolean }> }> = [
  {
    title: 'Product',
    links: [
      { href: '/discover', label: 'Discover agents' },
      { href: '/compare', label: 'Compare' },
      { href: '/workspace', label: 'Workspace' },
      { href: '/build', label: 'Build an agent' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { href: '/developers', label: 'Overview' },
      { href: '/developers#api', label: 'Public API' },
      { href: '/developers#protocols', label: 'Protocols' },
      { href: GITHUB_REPO_URL, label: 'Source code', external: true },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/how-it-works', label: 'How it works' },
      { href: '/methodology', label: 'Methodology' },
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
    <footer className="mt-24 border-t border-rule bg-sunken/60 pb-16 md:pb-0">
      <div className="frame grid grid-cols-1 gap-12 py-14 lg:grid-cols-[1.1fr_3fr]">
        <div className="flex max-w-xs flex-col gap-4">
          <span className="inline-flex items-center gap-2.5 text-ink">
            <Mark size={22} />
            <span className="text-[17px] font-[640] tracking-[-0.03em]">Pokter</span>
          </span>
          <p className="text-sm leading-relaxed text-ink-2">
            Find agents that actually work. Evidence first, one escrow per job, no standing access to your wallet.
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
      <div className="border-t border-rule">
        <div className="frame flex flex-col gap-2 py-5 text-[12.5px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>An independent agent marketplace built on BNB Chain. Not operated or endorsed by BNB Chain.</p>
          <p className="t-readout">ERC-8004 · ERC-8183 · A2A · MCP</p>
        </div>
      </div>
    </footer>
  );
}
