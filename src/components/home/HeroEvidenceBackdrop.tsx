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
      <div className="absolute left-1/2 top-[48%] h-px w-[72rem] max-w-[92vw] -translate-x-1/2 bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--brand)_16%,transparent),transparent)]" />
      <div className="hero-ambient-grain absolute inset-0 opacity-[0.025]" />
    </div>
  );
}
