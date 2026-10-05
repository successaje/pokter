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
    /*
     * A strip under the nav, on every page, rather than a card on the home
     * page.
     *
     * It was a bordered gold panel above the hero, which meant it only
     * existed on the one page somebody lands on before they start work —
     * invisible from the catalogue, the agent pages and the launchpad,
     * which is where the campaign's tasks are actually done. Full width and
     * quiet is what lets it sit on all of them without competing with the
     * page: it is a standing fact about the window being open, not a
     * promotion to be read once.
     */
    <aside
      className="border-b border-[color:var(--border)] bg-[color:var(--bg-subtle)]"
      aria-label="Set and Earn campaign"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-2 sm:px-8">
        <p className="min-w-0 truncate text-[12px] leading-5 text-[color:var(--text-secondary)]">
          <strong className="font-medium text-[color:var(--text)]">
            Set and Earn is open.
          </strong>{' '}
          <span className="hidden sm:inline">Testnet hires count. </span>
          <span className="text-[color:var(--text-muted)]">{CAMPAIGN_END_LABEL}</span>
        </p>
        <Link
          href="/set-and-earn"
          className="shrink-0 text-[11px] font-medium text-[color:var(--text)] underline-offset-4 hover:underline"
        >
          Your progress
        </Link>
      </div>
    </aside>
  );
}
