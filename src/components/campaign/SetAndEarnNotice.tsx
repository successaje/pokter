import Link from "next/link";

export function SetAndEarnNotice() {
  return (
    <aside
      className="rounded-[var(--radius-lg)] border border-[color:var(--brand)]/35 bg-[color:var(--brand-highlight-soft)] px-5 py-4 sm:px-6"
      aria-label="Set and Earn campaign"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[color:var(--brand)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--brand-ink)]">
              Live now
            </span>
            <span className="mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              1 Oct – 5 Nov · 12:00 UTC
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold">
            Set and Earn: register first, then hire and build on BNB Chain.
          </p>
          <p className="mt-1 text-[11px] leading-5 text-[color:var(--text-secondary)]">
            Testnet hires count. Qualifying agents need real completed hires and
            category-consistent onchain activity—not only a registration.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href="https://www.bnbchain.org/en/hackathons/smart-money-era-set-and-earn"
            target="_blank"
            rel="noreferrer"
            className="action-primary inline-flex min-h-10 items-center justify-center rounded-[var(--radius)] px-4 text-[11px] font-semibold"
          >
            Register with BNB Chain ↗
          </a>
          <Link
            href="/set-and-earn"
            className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--surface)] px-4 text-[11px] font-semibold"
          >
            View the checklist
          </Link>
        </div>
      </div>
    </aside>
  );
}
