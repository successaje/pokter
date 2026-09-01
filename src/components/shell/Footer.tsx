import Link from 'next/link';

import { Logo } from '@/components/brand/Logo';

const COLUMNS: { heading: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    heading: 'Marketplace',
    links: [
      { label: 'Discover', href: '/discover' },
      { label: 'All agents', href: '/agents' },
      { label: 'Compare', href: '/compare' },
      { label: 'Rankings', href: '/leaderboard' },
      { label: 'My agents', href: '/my-agents' },
    ],
  },
  {
    heading: 'Categories',
    links: [
      { label: 'Rebalancing', href: '/categories/rebalancing' },
      { label: 'Grid trading', href: '/categories/grid-trading' },
      { label: 'Yield optimisation', href: '/categories/yield' },
      { label: 'Health factor', href: '/categories/health-factor' },
    ],
  },
  {
    heading: 'How it works',
    links: [
      { label: 'Methodology', href: '/methodology' },
      { label: 'Agent Advantage report', href: '/agent-advantage' },
      {
        label: 'Source and integration notes',
        href: 'https://github.com/successaje/pokter',
        external: true,
      },
    ],
  },
];

/**
 * The footer carries the disclaimers that belong near the exit, not the ones
 * buried in a legal page nobody opens. The evidence caveat sits alongside the
 * navigation deliberately: a reader leaving the site should take the limits
 * with them.
 */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-[color:var(--border)] bg-[color:var(--bg-subtle)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-5 py-12 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_2fr]">
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2">
              <Logo size={22} />
              <span className="text-base font-semibold tracking-tight">Pokter</span>
            </Link>
            <p className="max-w-sm text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
              The decision layer for autonomous finance on BNB Chain. Discover,
              verify, compare and safely hire financial agents — with
              permissions you set and can revoke.
            </p>
            <p className="text-[11px] text-[color:var(--text-faint)]">
              Built for the BNB Chain Smart Money Era hackathon.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {COLUMNS.map((column) => (
              <div key={column.heading} className="flex flex-col gap-3">
                <p className="text-[10px] font-medium uppercase tracking-widest text-[color:var(--text-faint)]">
                  {column.heading}
                </p>
                <ul className="flex flex-col gap-2">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-[12px] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text)]"
                        >
                          {link.label} ↗
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-[12px] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text)]"
                        >
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

        <div className="flex flex-col gap-4 border-t border-[color:var(--border)] pt-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <p className="text-[11px] leading-relaxed text-[color:var(--text-faint)]">
              <span className="font-medium text-[color:var(--text-muted)]">
                What we can and cannot tell you.
              </span>{' '}
              Pokter measures whether an agent responds and what independent
              measurers have attested. It does not know whether an agent makes
              money — nobody publishes that — and it says so on every score.
            </p>
            <p className="text-[11px] leading-relaxed text-[color:var(--text-faint)]">
              <span className="font-medium text-[color:var(--text-muted)]">
                Not investment advice.
              </span>{' '}
              Historical performance is not a guarantee of future results. You
              remain responsible for reviewing permissions and risks before
              activating an agent. Sessions and escrow currently run on BSC
              testnet, and every surface showing one says so.
            </p>
          </div>

          <p className="text-[11px] text-[color:var(--text-faint)]">
            Agent data from the ERC-8004 registry via 8004scan · Measurements by
            Pokter
          </p>
        </div>
      </div>
    </footer>
  );
}
