import type { CSSProperties } from 'react';

type Moment = 'publish' | 'register' | 'verify' | 'discover' | 'hire';

const MOMENTS: { id: Moment; eyebrow: string; title: string }[] = [
  { id: 'publish', eyebrow: 'Builders', title: 'Publish agents' },
  { id: 'register', eyebrow: 'ERC-8004', title: 'Register on BNB Chain' },
  { id: 'verify', eyebrow: 'Pokter', title: 'Verify and measure' },
  { id: 'discover', eyebrow: 'Marketplace', title: 'Discover and compare' },
  { id: 'hire', eyebrow: 'Escrow', title: 'Hire while in control' },
];

function Doodle({ moment }: { moment: Moment }) {
  const common = 'h-16 w-20 overflow-visible fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round]';

  if (moment === 'publish') return (
    <svg viewBox="0 0 80 64" className={common} aria-hidden>
      <path d="M9 55h62M18 55V34h36v21M57 55V18h10v37M22 34l5-14h22l5 14" strokeWidth="1.5" />
      <circle cx="38" cy="14" r="6" strokeWidth="1.5" />
      <path d="M28 33c1-8 5-12 10-12s9 4 10 12M31 42h15M31 47h10" strokeWidth="1.5" />
      <path d="m60 11 2-3m4 5 3-1" className="journey-spark" strokeWidth="1.8" />
    </svg>
  );

  if (moment === 'register') return (
    <svg viewBox="0 0 80 64" className={common} aria-hidden>
      <path d="M22 8h27l10 10v38H22zM49 8v11h10" strokeWidth="1.5" />
      <path d="M30 27h21M30 34h21M30 41h13" strokeWidth="1.5" opacity=".65" />
      <path d="m51 47 4 4 8-9" className="journey-check" strokeWidth="2" />
    </svg>
  );

  if (moment === 'verify') return (
    <svg viewBox="0 0 80 64" className={common} aria-hidden>
      <path d="m40 7 23 11v14c0 14-10 22-23 26-13-4-23-12-23-26V18z" strokeWidth="1.5" />
      <path d="M30 31h20M34 25h12M34 37h12" strokeWidth="1.5" opacity=".55" />
      <path d="m34 46 4 4 9-10" className="journey-check" strokeWidth="2.2" />
      <path d="m63 9 2-4m3 6 4-2" className="journey-spark" strokeWidth="1.8" />
    </svg>
  );

  if (moment === 'discover') return (
    <svg viewBox="0 0 80 64" className={common} aria-hidden>
      <rect x="11" y="12" width="44" height="38" rx="4" strokeWidth="1.5" />
      <path d="M19 23h27M19 30h17M19 42l8-7 7 4 10-11" strokeWidth="1.5" />
      <circle cx="55" cy="44" r="10" strokeWidth="1.7" />
      <path d="m62 51 7 7" strokeWidth="1.7" />
      <circle cx="44" cy="28" r="2" className="journey-node" stroke="none" />
    </svg>
  );

  return (
    <svg viewBox="0 0 80 64" className={common} aria-hidden>
      <path d="M8 55h64M18 55V35h35v20M57 55V22h8v33" strokeWidth="1.5" />
      <circle cx="37" cy="15" r="7" strokeWidth="1.5" />
      <path d="M27 34c1-8 5-12 10-12s9 4 10 12" strokeWidth="1.5" />
      <circle cx="61" cy="13" r="10" className="journey-seal" strokeWidth="1.5" />
      <path d="m56 13 3 3 6-7" className="journey-check" strokeWidth="2" />
    </svg>
  );
}

/** A quiet visual hand-off from Pokter's promise to the real agents below. */
export function MarketplaceJourney() {
  return (
    <section aria-labelledby="journey-title" className="marketplace-journey relative -mt-12 overflow-hidden py-5 sm:-mt-16 sm:py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center">
        <div className="text-center">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--brand-strong)]">One visible path</p>
          <h2 id="journey-title" className="mt-2 text-base font-semibold sm:text-lg">From a builder’s agent to a buyer’s decision.</h2>
        </div>

        <div className="relative mt-8 w-full sm:mt-10">
          <svg className="journey-route pointer-events-none absolute left-[7%] top-11 hidden h-12 w-[86%] overflow-visible md:block" viewBox="0 0 1000 80" preserveAspectRatio="none" aria-hidden>
            <path className="journey-route-base" d="M0 39 C120 2 205 72 320 39 S520 5 635 39 S835 72 1000 39" pathLength="1" />
            <path className="journey-route-active" d="M0 39 C120 2 205 72 320 39 S520 5 635 39 S835 72 1000 39" pathLength="1" />
          </svg>

          <ol className="relative grid gap-3 md:grid-cols-5 md:gap-4">
            {MOMENTS.map((moment, index) => (
              <li
                key={moment.id}
                className="journey-step group relative grid grid-cols-[76px_1fr] items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)]/80 bg-[color:var(--surface)]/72 px-4 py-3 backdrop-blur-sm md:flex md:min-h-44 md:flex-col md:justify-end md:border-transparent md:bg-transparent md:px-2 md:py-0 md:text-center md:backdrop-blur-none"
                style={{ '--journey-index': index } as CSSProperties}
              >
                {index < MOMENTS.length - 1 && <span className="absolute bottom-[-13px] left-[37px] h-3 border-l border-dashed border-[color:var(--brand)]/45 md:hidden" aria-hidden />}
                <span className="journey-art relative z-10 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[color:var(--bg)]/88 text-[color:var(--text-secondary)] shadow-[0_10px_32px_color-mix(in_srgb,var(--text)_4%,transparent)] transition-transform duration-500 group-hover:-translate-y-1 md:h-24 md:w-24">
                  <Doodle moment={moment.id} />
                  <span className="journey-dot absolute -bottom-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full border-2 border-[color:var(--bg)] bg-[color:var(--brand)] md:-bottom-3" />
                </span>
                <span className="relative z-10">
                  <span className="mono block text-[9px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">{moment.eyebrow}</span>
                  <span className="mt-1 block text-[12px] font-medium leading-5 text-[color:var(--text)]">{moment.title}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <p className="mt-7 max-w-xl text-center text-[11px] leading-5 text-[color:var(--text-muted)] sm:mt-9">
          Public identity in. Observable evidence out. The buyer’s wallet stays the buyer’s wallet throughout.
        </p>
      </div>
    </section>
  );
}
