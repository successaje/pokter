/**
 * A purely decorative map of the marketplace becoming a decision.
 *
 * Identities sit at the perimeter, evidence travels along the routes, and the
 * verified core holds the centre. It deliberately carries no product claims;
 * the readable hero above it remains the source of truth.
 */
export function HeroEvidenceBackdrop() {
  const nodes = [
    { className: 'left-[5%] top-[18%]', mark: 'Y', label: 'Yield' },
    { className: 'right-[7%] top-[15%]', mark: 'G', label: 'Grid' },
    { className: 'left-[9%] bottom-[18%]', mark: 'R', label: 'Rebalance' },
    { className: 'right-[5%] bottom-[20%]', mark: 'H', label: 'Risk' },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="hero-aurora absolute left-1/2 top-[46%] h-[34rem] w-[58rem] max-w-[96vw] -translate-x-1/2 -translate-y-1/2 rounded-full" />

      <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full opacity-60">
        <defs>
          <linearGradient id="route-gold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--border)" stopOpacity="0" />
            <stop offset="0.48" stopColor="var(--brand)" stopOpacity="0.65" />
            <stop offset="1" stopColor="var(--border)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="url(#route-gold)" strokeWidth="1.2">
          <path className="hero-route hero-route-a" d="M40 150 C270 140 320 330 600 350 S930 135 1160 155" />
          <path className="hero-route hero-route-b" d="M70 565 C290 550 360 390 600 350 S900 545 1140 560" />
          <path className="hero-route hero-route-c" d="M180 40 C290 220 470 180 600 350 S910 420 1030 40" />
        </g>
        <g fill="var(--brand)">
          <circle className="hero-signal signal-a" r="4" />
          <circle className="hero-signal signal-b" r="3" />
          <circle className="hero-signal signal-c" r="3.5" />
        </g>
      </svg>

      <div className="hero-core absolute left-1/2 top-[46%] grid size-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[color:var(--brand)]/25 opacity-[0.12] sm:size-40">
        <div className="grid size-14 place-items-center rounded-2xl border border-[color:var(--brand)]/40 bg-[color:var(--surface)]/70 shadow-xl backdrop-blur-md sm:size-20">
          <svg viewBox="0 0 40 40" className="size-8 sm:size-11" fill="none">
            <path d="M9 7h13c7 0 11 4 11 10s-4 10-11 10h-7v6H9V7Z" stroke="var(--text)" strokeWidth="3.5" strokeLinejoin="round" />
            <rect x="15" y="13" width="9" height="8" rx="2.5" fill="var(--brand)" />
          </svg>
        </div>
      </div>

      {nodes.map((node, index) => (
        <div key={node.label} className={`hero-agent-node absolute ${node.className} hidden items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]/65 p-2 pr-3 shadow-sm backdrop-blur-md sm:flex`} style={{ animationDelay: `${index * -1.35}s` }}>
          <span className="grid size-8 place-items-center rounded-xl bg-[color:var(--brand)]/12 text-[11px] font-bold text-[color:var(--brand)]">{node.mark}</span>
          <span className="flex flex-col">
            <span className="text-[10px] font-semibold">{node.label} agent</span>
            <span className="flex items-center gap-1 text-[8px] uppercase tracking-wide text-[color:var(--text-faint)]"><span className="size-1 rounded-full bg-[color:var(--positive)]" /> measured</span>
          </span>
        </div>
      ))}

      <span className="hero-proof-chip absolute left-[18%] top-[38%] hidden rounded-full border border-[color:var(--border)] bg-[color:var(--surface)]/55 px-3 py-1.5 text-[9px] font-medium text-[color:var(--text-muted)] backdrop-blur-md lg:block">Identity verified</span>
      <span className="hero-proof-chip absolute right-[17%] top-[36%] hidden rounded-full border border-[color:var(--border)] bg-[color:var(--surface)]/55 px-3 py-1.5 text-[9px] font-medium text-[color:var(--text-muted)] backdrop-blur-md lg:block" style={{ animationDelay: '-2s' }}>Endpoint answered</span>
      <span className="hero-proof-chip absolute bottom-[26%] left-[14%] hidden rounded-full border border-[color:var(--border)] bg-[color:var(--surface)]/55 px-3 py-1.5 text-[9px] font-medium text-[color:var(--text-muted)] backdrop-blur-md lg:block" style={{ animationDelay: '-4s' }}>Terms signed</span>
      <span className="hero-proof-chip absolute bottom-[25%] right-[13%] hidden rounded-full border border-[color:var(--border)] bg-[color:var(--surface)]/55 px-3 py-1.5 text-[9px] font-medium text-[color:var(--text-muted)] backdrop-blur-md lg:block" style={{ animationDelay: '-6s' }}>Escrow scoped</span>
    </div>
  );
}
