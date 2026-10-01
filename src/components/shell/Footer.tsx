import Image from 'next/image';
import Link from 'next/link';

import { Wordmark } from '@/components/brand/Logo';
import { CHAIN_ID, NETWORK_LABEL } from '@/lib/network/presentation';

const COLUMNS = [
  {
    heading: 'Marketplace',
    links: [
      { label: 'Discover agents', href: '/discover' },
      { label: 'Browse marketplace', href: '/agents' },
      { label: 'Compare agents', href: '/compare' },
      { label: 'Rankings', href: '/leaderboard' },
      { label: 'Activity', href: '/my-agents' },
    ],
  },
  {
    heading: 'Research',
    links: [
      { label: 'How it is built', href: '/about' },
      { label: 'Methodology', href: '/methodology' },
      { label: 'Liveness census', href: '/census' },
      { label: 'Agent advantage', href: '/agent-advantage' },
      { label: 'Pool economics', href: '/pool-check' },
      { label: 'Rebalancing', href: '/categories/rebalancing' },
      { label: 'Yield agents', href: '/categories/yield' },
    ],
  },
  /*
   * Until now the only way to reach anyone was to find the GitHub icon and
   * guess that issues were open. A marketplace that funds escrow from a
   * stranger's wallet should not make being contacted a puzzle.
   */
  {
    heading: 'Support',
    links: [
      { label: 'Get help', href: '/support' },
      { label: 'Launch an agent', href: '/build' },
      { label: 'Read API', href: '/api/v1' },
      { label: 'Report a problem', href: '/support#where-to-send-what' },
      { label: 'Security', href: '/support#security' },
    ],
  },
  /*
   * A product that funds escrow from a stranger's wallet owes them these
   * before they sign, not buried in a support thread afterwards.
   */
  {
    heading: 'Legal',
    links: [
      { label: 'Risk disclosure', href: '/risk' },
      { label: 'Terms of use', href: '/terms' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'How we measure', href: '/methodology' },
    ],
  },
] as const;

function XMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.24c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.41-1.27.74-1.56-2.57-.29-5.27-1.28-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.75 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.06.79 2.14v3.18c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}

const socialClass =
  'flex size-11 items-center justify-center rounded-full border border-[color:var(--border-strong)] md:size-9 text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--text-faint)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-[color:var(--border)] bg-[color:var(--bg-subtle)]">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-12">
        {/*
          Five tracks, not four: the Legal column was added and wrapped onto a
          row of its own, which read as an afterthought rather than as a peer of
          the other three. Column spacing tightens from 40px to 24px so the
          width comes out of the gaps instead of out of the brand blurb, which
          was wrapping to four cramped lines beside them.
        */}
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-[1.5fr_repeat(4,1fr)] lg:gap-x-8">
          <div className="flex max-w-md flex-col items-start gap-4">
            <Link href="/" aria-label="Pokter home" className="tap">
              <Wordmark size={24} />
            </Link>
            <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
              The evidence-first marketplace for discovering, verifying and
              hiring autonomous financial agents on BNB Chain.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="https://www.bnbchain.org/"
                target="_blank"
                rel="noreferrer noopener"
                className="tap flex h-9 items-center gap-2 rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-3 text-[11px] font-medium transition-colors hover:bg-[color:var(--surface-hover)]"
              >
                <Image
                  src="/integrations/bnbchain.ico"
                  alt=""
                  width={18}
                  height={18}
                  className="size-[18px] rounded-sm"
                  unoptimized
                />
                Built on BNB Chain
              </a>
              <a
                href="https://x.com/usepokter"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Pokter on X"
                className={socialClass}
              >
                <XMark />
              </a>
              <a
                href="https://github.com/successaje/pokter"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Pokter source on GitHub"
                className={socialClass}
              >
                <GitHubMark />
              </a>
            </div>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading} className="flex flex-col gap-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--text-faint)]">
                {column.heading}
              </p>
              <ul className="grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-1">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      /*
                       * Footer links are a stacked list on a phone, where a
                       * 14px line is a hard target between two other links.
                       * Padding rather than min-height so the rows stay a
                       * list; md:py-0 leaves the desktop columns as they were.
                       */
                      className="tap text-[12px] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--text)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-5 border-t border-[color:var(--border)] pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] text-[color:var(--text-faint)]">
              <span className="flex items-center gap-1.5 rounded-full border border-[color:var(--border)] px-2.5 py-1">
                <span className="size-1.5 rounded-full bg-[color:var(--positive)]" />
                Hiring: {NETWORK_LABEL} · chain {CHAIN_ID}
              </span>
              <span>ERC-8004 identity</span>
              <span aria-hidden>·</span>
              <span>ERC-8183 escrow</span>
            </div>
            <p className="text-[10px] text-[color:var(--text-faint)]">
              © 2026 Pokter
            </p>
          </div>

          <p className="max-w-4xl text-[10px] leading-relaxed text-[color:var(--text-faint)]">
            Pokter verifies identity, endpoint behavior and published evidence;
            it does not promise agent profitability. Escrow and cryptographic
            receipts reduce counterparty risk but do not remove market or
            smart-contract risk. Not investment advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
