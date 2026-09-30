/** Quiet atmosphere for the landing hero; product meaning stays foreground. */
export function HeroEvidenceBackdrop() {
  return (
    <div className="hero-ambient-stage pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="hero-ambient-glow absolute left-1/2 top-[48%] h-[38rem] w-[64rem] max-w-[110vw] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <div className="hero-ambient-orbit absolute left-1/2 top-[48%] aspect-[1.7/1] w-[78rem] max-w-[112vw] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-[color:var(--brand)]/10">
        <span className="hero-signal-dot absolute left-[12%] top-[18%] size-1.5 rounded-full bg-[color:var(--brand)]" />
      </div>
      <div className="hero-ambient-orbit hero-ambient-orbit-inner absolute left-1/2 top-[48%] aspect-[1.65/1] w-[55rem] max-w-[84vw] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-[color:var(--brand)]/10">
        <span className="hero-signal-dot hero-signal-dot-late absolute bottom-[12%] right-[16%] size-1 rounded-full bg-[color:var(--brand)]" />
      </div>
      <svg className="hero-flow-map absolute inset-0 size-full" viewBox="0 0 1440 720" preserveAspectRatio="none">
        <defs>
          <marker id="hero-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        <path className="hero-flow-path hero-flow-path-left" pathLength="1" d="M 30 530 C 250 475, 360 625, 610 540 C 690 512, 715 492, 735 455" markerEnd="url(#hero-arrow)" />
        <path className="hero-flow-path hero-flow-path-right" pathLength="1" d="M 1410 235 C 1210 175, 1085 310, 910 338 C 810 354, 770 395, 740 455" markerEnd="url(#hero-arrow)" />
        <path className="hero-flow-signal hero-flow-signal-left" pathLength="1" d="M 30 530 C 250 475, 360 625, 610 540 C 690 512, 715 492, 735 455" />
        <path className="hero-flow-signal hero-flow-signal-right" pathLength="1" d="M 1410 235 C 1210 175, 1085 310, 910 338 C 810 354, 770 395, 740 455" />
      </svg>
      <div className="absolute left-1/2 top-[48%] h-px w-[72rem] max-w-[92vw] -translate-x-1/2 bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--brand)_16%,transparent),transparent)]" />
      <div className="hero-ambient-grain absolute inset-0 opacity-[0.025]" />
    </div>
  );
}
