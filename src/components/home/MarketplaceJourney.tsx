import type { CSSProperties } from 'react';

type Moment = 'publish' | 'register' | 'verify' | 'discover' | 'hire';

const MOMENTS: { id: Moment; eyebrow: string; title: string }[] = [
  { id: 'publish', eyebrow: 'Builders', title: 'Publish agents' },
  { id: 'register', eyebrow: 'ERC-8004', title: 'Register on BNB Chain' },
  { id: 'verify', eyebrow: 'Pokter', title: 'Verify and measure' },
  { id: 'discover', eyebrow: 'Marketplace', title: 'Discover and compare' },
  { id: 'hire', eyebrow: 'Escrow', title: 'Hire while in control' },
];

function BuilderScene() {
  return (
    <svg viewBox="0 0 150 104" className="h-[88px] w-[128px] overflow-visible fill-none stroke-current sm:h-[104px] sm:w-[150px]" aria-hidden>
      <path d="M5 94h139M20 94V72h49v22M27 72l8-23h40l-6 23M39 56h24M99 94V53h39v41" strokeWidth="1.5" />
      <circle cx="49" cy="34" r="10" strokeWidth="1.5" />
      <path d="M38 51c1-9 5-14 11-14s10 5 11 14M41 28c3-8 13-9 18-2M103 59h28M103 66h21" strokeWidth="1.5" />
      <path d="M111 47h22v22h-22z" className="journey-floating-card" strokeWidth="1.3" />
      <path d="m116 58 4 4 8-9" className="journey-check" strokeWidth="2" />
      <path d="M84 17c11-8 22-8 33 0" strokeWidth="1.2" opacity=".55" />
      <path d="m113 13 4 4-5 2" strokeWidth="1.2" />
      <path d="M13 67c2-11 7-17 14-20" className="journey-spark" strokeWidth="1.7" />
    </svg>
  );
}

function BuyerScene() {
  return (
    <svg viewBox="0 0 150 104" className="h-[88px] w-[128px] overflow-visible fill-none stroke-current sm:h-[104px] sm:w-[150px]" aria-hidden>
      <path d="M6 94h139M82 94V72h49v22M75 72l-6-23h40l8 23M81 56h24M13 94V53h39v41" strokeWidth="1.5" />
      <circle cx="96" cy="34" r="10" strokeWidth="1.5" />
      <path d="M85 51c1-9 5-14 11-14s10 5 11 14M86 27c4-7 14-7 19 0M18 59h28M18 66h20" strokeWidth="1.5" />
      <path d="M16 47h31v22H16z" className="journey-floating-card" strokeWidth="1.3" />
      <circle cx="25" cy="58" r="5" className="journey-seal" strokeWidth="1.2" />
      <path d="m22 58 2 2 4-5" className="journey-check" strokeWidth="1.5" />
      <path d="M61 17c-11-8-22-8-33 0" strokeWidth="1.2" opacity=".55" />
      <path d="m32 13-4 4 5 2" strokeWidth="1.2" />
      <path d="M133 67c-2-11-7-17-14-20" className="journey-spark" strokeWidth="1.7" />
    </svg>
  );
}

function ProcessMark({ moment }: { moment: Exclude<Moment, 'publish' | 'hire'> }) {
  if (moment === 'register') return (
    <svg viewBox="0 0 66 58" className="h-14 w-16 fill-none stroke-current" aria-hidden>
      <path d="M16 5h25l9 9v39H16zM41 5v10h9M23 25h20M23 32h16M23 39h11" strokeWidth="1.45" />
      <path d="m39 45 3 3 7-8" className="journey-check" strokeWidth="1.9" />
    </svg>
  );
  if (moment === 'verify') return (
    <svg viewBox="0 0 90 58" className="h-14 w-[88px] fill-none stroke-current" aria-hidden>
      <rect x="6" y="8" width="78" height="42" rx="6" className="journey-pokter-card" strokeWidth="1.35" />
      <path d="M23 20h11v11H23zM28.5 20v11M23 25.5h11" strokeWidth="2" />
      <path d="M42 22h25M42 29h19" strokeWidth="1.35" opacity=".65" />
      <path d="m56 39 4 4 8-9" className="journey-check" strokeWidth="2" />
      <path d="m75 4 2-4m3 6 4-2" className="journey-spark" strokeWidth="1.7" />
    </svg>
  );
  return (
    <svg viewBox="0 0 66 58" className="h-14 w-16 fill-none stroke-current" aria-hidden>
      <rect x="7" y="8" width="43" height="38" rx="4" strokeWidth="1.45" />
      <path d="M14 36l8-8 7 4 11-13M14 18h17" strokeWidth="1.45" />
      <circle cx="48" cy="42" r="9" strokeWidth="1.6" /><path d="m54 49 7 6" strokeWidth="1.6" />
      <circle cx="40" cy="19" r="2" className="journey-node" stroke="none" />
    </svg>
  );
}

function Art({ moment }: { moment: Moment }) {
  if (moment === 'publish') return <BuilderScene />;
  if (moment === 'hire') return <BuyerScene />;
  return <ProcessMark moment={moment} />;
}

/** The complete marketplace story, deliberately inside the opening scene. */
export function MarketplaceJourney() {
  return (
    <div className="marketplace-journey relative z-10 mt-6 w-[min(96vw,88rem)] sm:mt-8" aria-label="How an agent moves from its builder to a buyer">
      <svg className="journey-route pointer-events-none absolute left-[8%] top-[43px] hidden h-16 w-[84%] overflow-visible md:block" viewBox="0 0 1000 90" preserveAspectRatio="none" aria-hidden>
        <path className="journey-route-base" d="M0 44 C120 4 205 78 320 44 S520 5 635 44 S835 80 1000 44" pathLength="1" />
        <path className="journey-route-active" d="M0 44 C120 4 205 78 320 44 S520 5 635 44 S835 80 1000 44" pathLength="1" />
      </svg>

      <ol className="relative grid grid-cols-1 gap-2 md:grid-cols-[1.18fr_.8fr_.9fr_.8fr_1.18fr] md:items-start md:gap-2">
        {MOMENTS.map((moment, index) => (
          <li
            key={moment.id}
            className="journey-step group relative hidden min-h-[116px] flex-col items-center justify-start text-center first:flex last:flex md:flex"
            style={{ '--journey-index': index } as CSSProperties}
          >
            <span className="journey-art relative z-10 flex h-[76px] min-w-[76px] items-center justify-center text-[color:var(--text-secondary)] transition-transform duration-500 group-hover:-translate-y-1 md:h-[92px]">
              <Art moment={moment.id} />
              <span className="journey-dot absolute bottom-0 left-1/2 size-2.5 -translate-x-1/2 rounded-full border-2 border-[color:var(--bg)] bg-[color:var(--brand)]" />
            </span>
            <span className="relative z-10 mt-1 rounded-full bg-[color:var(--bg)]/82 px-2 py-1 backdrop-blur-sm">
              <span className="mono block text-[8px] uppercase tracking-[0.15em] text-[color:var(--text-muted)]">{moment.eyebrow}</span>
              <span className="mt-0.5 block text-[10px] font-medium leading-4 text-[color:var(--text)] sm:text-[11px]">{moment.title}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-[color:var(--text-muted)] md:hidden">
        <span>Builders publish</span><span className="text-[color:var(--brand-strong)]">→</span><span>Pokter verifies</span><span className="text-[color:var(--brand-strong)]">→</span><span>Buyers hire</span>
      </div>
    </div>
  );
}
