'use client';

import {
  IS_TESTNET,
  NETWORK_LABEL,
} from '@/lib/network/presentation';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { cn } from '@/lib/ui/cn';
import { ConnectWallet } from './ConnectWallet';
import { ThemeToggle } from './ThemeToggle';
import { Wordmark } from '@/components/brand/Logo';
import { useDismissibleLayer } from '@/lib/ui/useDismissibleLayer';
import { InstallPokter } from '@/components/pwa/InstallPokter';
import { usePwaInstall } from '@/components/pwa/PwaProvider';
import { SavedNavAction } from '@/components/shell/SavedNavAction';
import { AccountNavAction } from '@/components/shell/AccountNavAction';

/**
 * §11. Primary navigation.
 *
 * Ordered along the product loop — discover, then compare, then act — so the
 * nav itself teaches the journey. Browsing never requires a wallet (§59), so
 * Connect sits apart from the primary items rather than gating them.
 */
/*
 * Six entries became four, and the two that remain for agents say which is
 * which.
 *
 * Discover, Marketplace, Rankings and Compare were four top-level answers to
 * one question. Folding all of them behind Discover went too far the other
 * way: Discover narrows by outcome and can build a shortlist against a risk
 * bar and a horizon, and someone who simply wants to read the catalogue
 * should not have to start by answering questions. So both stay, named for
 * what they are — Discover leads you to agents, Agents is the list of them.
 *
 * Which one the landing page points at is settled: all of it goes to Agents.
 * Discover is reached from here and from the catalogue, not by competing for
 * the same first click.
 *
 * Rankings left the bar because it is not a destination but the same set in a
 * different order, and it now switches with the catalogue on both pages.
 * Compare keeps its slot because comparing is what this product is for, and
 * Pool check is research about pools rather than a route to an agent.
 *
 * Nothing is removed. Every route still resolves and the ones that left the
 * bar are in the footer and cross-linked from the pages that lead to them.
 */
const PRIMARY = [
  { href: '/discover', label: 'Discover' },
  { href: '/agents', label: 'Agents' },
  { href: '/compare', label: 'Compare' },
  { href: '/activity', label: 'Activity' },
];

// Builder Studio is a first-class desktop destination. Mobile keeps five
// total tab-bar items and exposes it through More so the bar never compresses
// labels or creates a sixth overflow column.
/*
 * `wide` items appear only once the row can actually hold them.
 *
 * All six used to render from the moment the desktop bar appeared, and the
 * bar cannot hold six at every desktop width: the right-hand cluster grows at
 * xl, when the network pill writes itself out in full. Measured, the row
 * needs about 900px for four links and about 1,280px for six. One breakpoint
 * cannot satisfy both, which is why moving the single switch did not fix this
 * — at 1,024px "Activity" still landed on top of the pill.
 *
 * So the two that are reachable elsewhere wait for the room. Launch is in the
 * More menu and the footer; Campaign is in the secondary menu as Set and Earn.
 * Neither is lost at any width, and nothing is ever painted over anything.
 */
const DESKTOP_PRIMARY: { href: string; label: string; wide?: boolean }[] = [
  ...PRIMARY.slice(0, 3),
  PRIMARY[3],
  /*
   * The two halves of "my stuff", named apart.
   *
   * Activity is the work you commissioned; My agents is the work you
   * publish. They used to be one destination reached by entering Account,
   * choosing whether you were hiring or building, and then — if hiring —
   * flipping a toggle. Three decisions to reach a list, and the first of
   * them asks a newcomer to classify themselves before they have done
   * either thing.
   *
   * Launch left this bar in the same move. It is the button on the My
   * agents page, the first thing in the More menu, and in the footer; a
   * fourth copy of it was competing with the page that now leads to it.
   */
  { href: '/builder', label: 'My agents', wide: true },
  { href: '/set-and-earn', label: '🔥 Campaign', wide: true },
];

/*
 * Rankings is not here because it is not a destination — it is the catalogue
 * in a different order, and it switches with it on both pages. Pool check is
 * research about pools rather than a route to an agent, and lives in the
 * footer with the rest of the research.
 */
const SECONDARY = [
  { href: '/account', label: 'Account' },
  { href: '/builder', label: 'My agents' },
  { href: '/set-and-earn', label: '🔥 Set and Earn' },
  { href: '/saved', label: 'Saved agents' },
  { href: '/leaderboard', label: 'Rankings' },
  /*
   * The way in for the other half of the audience.
   *
   * Everything else in this bar is for someone choosing an agent. Builders had
   * no route at all: the diagnostic was reachable from the footer and the
   * support page, so the people it exists for found it by accident. It is
   * labelled by what it does for them rather than by its own name — nobody
   * arrives wanting a diagnostic, they arrive wanting to be listed.
   */
  { href: '/build', label: 'Launch an agent' },
  { href: '/pool-check', label: 'Pool check' },
];

const MOBILE_PRIMARY = PRIMARY;
const MOBILE_MORE = SECONDARY;
const INSTALLED_PRIMARY = [
  { href: '/app', label: 'Home' },
  { href: '/discover', label: 'Discover' },
  { href: '/agents', label: 'Agents' },
  { href: '/activity', label: 'Activity' },
];

function MobileNavIcon({ href }: { href: string }) {
  const common = 'size-[18px] fill-none stroke-current';
  if (href === '/app') return <svg viewBox="0 0 24 24" aria-hidden className={common} strokeWidth="1.8"><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>;
  if (href === '/discover') return <svg viewBox="0 0 24 24" aria-hidden className={common} strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5M11 8v6M8 11h6" /></svg>;
  if (href === '/agents') return <svg viewBox="0 0 24 24" aria-hidden className={common} strokeWidth="1.8"><rect x="4" y="6" width="16" height="13" rx="4" /><path d="M9 11h.01M15 11h.01M9 15h6M12 6V3" /></svg>;
  if (href === '/compare') return <svg viewBox="0 0 24 24" aria-hidden className={common} strokeWidth="1.8"><path d="M8 4v16M16 4v16M4 8h8M12 16h8" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden className={common} strokeWidth="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19V2" /></svg>;
}

function MoreIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden className="size-[18px] fill-current"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { installed } = usePwaInstall();

  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--bg)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5 sm:px-8">
        {installed && pathname !== '/app' && (
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) router.back();
              else router.push('/app');
            }}
            aria-label="Go back"
            className="-mr-3 flex size-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--border)] text-[color:var(--text-secondary)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)] lg:hidden"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-[18px] fill-none stroke-current" strokeWidth="1.8">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        <Link
          href={installed ? '/app' : '/'}
          aria-label={installed ? 'Pokter app home' : 'Pokter home'}
          className="tap text-[color:var(--text)] transition-opacity hover:opacity-80"
        >
          <Wordmark />
        </Link>

        {/*
          The desktop bar turns on at lg, not md.

          It was switching on at 768px, where the nav is handed 193px to lay
          out 456px of links. Nothing was clipped, because this element
          overflows visibly — the last four links simply rendered on top of
          the network pill and the theme toggle. Every width from 768 up drew
          the two groups over each other.

          The mobile tab bar and the menu button move with it, so the band
          that used to overlap now gets the layout built for narrow screens.
          The two widest links then wait for xl-and-a-bit; see DESKTOP_PRIMARY
          for why one breakpoint could not do this on its own.
        */}
        <nav className="hidden min-w-0 flex-1 items-center gap-1 whitespace-nowrap lg:flex">
          {DESKTOP_PRIMARY.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-[var(--radius)] px-2.5 py-1.5 text-[13px] transition-colors',
                  item.wide && 'hidden min-[1340px]:block',
                  active
                    ? 'bg-[color:var(--surface-raised)] text-[color:var(--text)]'
                    : 'text-[color:var(--text-muted)] hover:text-[color:var(--text)]',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {/*
            FE-03 and FE-05. This pill used to be hidden below 640px and to
            name chain 56 only — the registry. Phase 2 requires the network to
            be stated, and money moves on the escrow chain, so the escrow
            network is what leads and it is never hidden.

            Both are named because both are true: agents are read from the
            mainnet registry while transactions settle on the escrow chain,
            and showing one number alone is what made the header and the hire
            page appear to contradict each other.
          */}
          {/*
            Shown at every width now. It used to start at 640px, which meant
            the one thing a phone user most needs to know — that the money on
            this screen is test money — was the one thing the phone header did
            not say.

            On testnet it carries the caution treatment rather than the muted
            one. A network name in the same grey as everything else is a label;
            in caution colour it is a warning, which is what it is.
          */}
          <span
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] sm:px-2.5',
              IS_TESTNET
                ? 'border-[color:var(--caution)]/40 bg-[color:var(--caution-dim)] text-[color:var(--caution)]'
                : 'border-[color:var(--border)] text-[color:var(--text-muted)]',
            )}
          >
            <Image
              src="/integrations/bnbchain.ico"
              alt=""
              width={14}
              height={14}
              className="size-3.5 shrink-0 rounded-full"
              unoptimized
            />
            {/*
              Only the escrow network, which is the part that must always be
              legible — it is where the money is and the one chain every hire
              settles on.

              This used to lead with "Identities: BNB Chain". That stopped
              being true when the catalogue took on chain 97: identities now
              sit on both chains, so the pill stated a half-truth in the one
              place it appears on every page. Naming both chains here would
              re-introduce the wrapping this pill was already trimmed to
              avoid, and the registry chain is on each agent's own page where
              it matters.
            */}
            <span className="hidden sm:inline">Hiring: </span>
            <span className="font-medium">{NETWORK_LABEL}</span>
          </span>
          {/*
            Shown at every width. It was hidden below 640px because three
            buttons in a row could not share the header with the network
            pill; one can.
          */}
          <ThemeToggle />
          <SavedNavAction />
          <AccountNavAction />
          <ConnectWallet />
        </div>
      </div>
    </header>
  );
}

/** §11. Mobile bottom navigation. */
export function MobileNav() {
  const pathname = usePathname();
  const { installed } = usePwaInstall();
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const layerRef = useDismissibleLayer<HTMLElement>({
    open: moreOpen,
    onDismiss: closeMore,
  });
  const moreActive = MOBILE_MORE.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  /*
     One tab bar, one definition. MobileAppHome used to render its own
     hardcoded four-tab bar, so /app showed different tabs from every other
     page in the same browser session — the one element a mobile app must
     keep still.

     The split is by *context*, not by route. Installed users get the app
     tabs everywhere; browser users get the web tabs everywhere. Keying it to
     the route instead would reintroduce the bug in a quieter form — the bar
     would still change identity as you moved between /app and /discover.

     A browser visitor who lands on /app therefore sees no Home tab, which is
     correct: in a browser the home is /, and the wordmark already goes there.
  */
  const primaryItems = installed ? INSTALLED_PRIMARY : MOBILE_PRIMARY;

  return (
    <nav
      ref={layerRef}
      /*
        Floated rather than attached. An edge-to-edge bar with a top border
        reads as a website's footer navigation; lifting it off the canvas,
        rounding it and giving it a shadow is most of what makes a thing feel
        like an application rather than a page.

        `bottom` carries the safe-area inset itself so the bar clears a home
        indicator without the old padding trick, which would have padded the
        inside of a rounded container and left the shadow sitting in the gap.
      */
      /*
        Yields to the hire bar. An agent page sets data-hire-bar on <body>
        once its sticky action is up; two fixed bars stacked at the foot of a
        phone is more furniture than screen, and only one of them is about
        the decision in front of the reader.
      */
      className="fixed inset-x-3 z-30 mx-auto max-w-[520px] overflow-hidden rounded-[1.25rem] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)]/92 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:hidden [body[data-hire-bar]_&]:hidden"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      aria-label="Primary navigation"
    >
      {moreOpen && (
        <div
          id="mobile-more-menu"
          className="absolute bottom-full right-2 mb-2 w-52 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-strong)] bg-[color:var(--surface-raised)] p-1.5 shadow-xl"
        >
          {MOBILE_MORE.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMore}
                className={cn(
                  'flex items-center justify-between rounded-[var(--radius)] px-3 text-sm transition-colors',
                  active
                    ? 'bg-[color:var(--brand-highlight-soft)] text-[color:var(--text)]'
                    : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text)]',
                )}
              >
                {item.label}
                <span aria-hidden>→</span>
              </Link>
            );
          })}
          <InstallPokter onComplete={closeMore} />
        </div>
      )}

      <div className="grid grid-cols-5 items-stretch">
        {primaryItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeMore}
              className={cn(
                'flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 text-[10px] transition-colors',
                active
                  ? 'text-[color:var(--text)]'
                  : 'text-[color:var(--text-muted)]',
              )}
            >
              <MobileNavIcon href={item.href} />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          className={cn(
            'flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 text-[10px] transition-colors',
            moreOpen || moreActive
              ? 'text-[color:var(--text)]'
              : 'text-[color:var(--text-muted)]',
          )}
        >
          <MoreIcon />
          More
        </button>
      </div>
    </nav>
  );
}
