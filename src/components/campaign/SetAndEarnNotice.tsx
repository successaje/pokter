import Link from "next/link";

import { CAMPAIGN_END_LABEL, isCampaignLive } from '@/lib/campaign/window';

export function SetAndEarnNotice() {
  /*
   * Removes itself when the campaign closes. This said "Set and Earn is live"
   * unconditionally, so the day after the deadline it would have been
   * announcing a campaign that had ended, and quoting the date it ended on as
   * though it were still ahead.
   */
  if (!isCampaignLive()) return null;

  return (
    <aside
      className="rounded-[var(--radius)] border border-[color:var(--brand)]/25 bg-[color:var(--brand-highlight-soft)] px-3 py-2.5 sm:px-4"
      aria-label="Set and Earn campaign"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="size-2 shrink-0 rounded-full bg-[color:var(--brand)] shadow-[0_0_0_4px_var(--brand-highlight-soft)]" />
          <p className="min-w-0 text-[12px] leading-4 text-[color:var(--text-secondary)] sm:text-[12px]">
            <strong className="font-semibold text-[color:var(--text)]">Set and Earn is live.</strong>{' '}
            <span className="hidden sm:inline">Register first; testnet hires count. </span>
            <span className="text-[color:var(--text-muted)]">{CAMPAIGN_END_LABEL}</span>
          </p>
        </div>
        <Link
          href="/set-and-earn"
          className="shrink-0 text-[10px] font-semibold text-[color:var(--brand-strong)] hover:underline sm:text-[11px]"
        >
          Track progress →
        </Link>
      </div>
    </aside>
  );
}
