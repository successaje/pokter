import Link from 'next/link';

import { CAMPAIGN_END_LABEL, isCampaignLive } from '@/lib/campaign/window';
import { Icon } from '@/ui/icons';
import { CampaignBarDismiss } from './CampaignBarDismiss';
import { CampaignDeadline } from './CampaignDeadline';

/*
 * The strip above the public header that tells a first-time visitor the
 * campaign is on. A page can be older than the server's "is it live": the
 * root layout's boot script re-checks the deadline before first paint and
 * honours a dismissal, so neither ever flashes, and `CampaignDeadline`
 * closes it on a page that is still open when the deadline passes.
 *
 * The sentence names all four of the rules' requirements. "Hire three and
 * build one" left out registering first, without which nothing counts, and
 * the second marketplace.
 */
export function CampaignBar() {
  if (!isCampaignLive()) return null;
  return (
    <div id="campaign-bar" className="border-b border-rule bg-signal-wash text-ink">
      <div className="frame flex min-h-10 items-center gap-3 py-1.5 text-[13px]">
        <span className="relative flex size-2 shrink-0" aria-hidden>
          <span className="absolute inset-0 animate-ping rounded-full bg-signal opacity-60 motion-reduce:animate-none" />
          <span className="relative size-2 rounded-full bg-signal" />
        </span>
        {/*
         * The rules on every width. A phone used to get only "Set and Earn is
         * live", with the rules a tap away, and so read as a campaign with no
         * conditions. It gets the same four in fewer words, and the strip
         * wraps rather than cutting them off.
         */}
        <p className="min-w-0 flex-1 leading-snug">
          <strong className="font-semibold"><span className="hidden sm:inline">BNB Chain </span>Set and Earn is live.</strong>{' '}
          <span className="hidden sm:inline">Register first, hire three different agents across at least two marketplaces, and build one agent of your own. </span>
          <span className="sm:hidden">Register, hire 3 different agents on 2+ marketplaces, build 1 of your own. </span>
          <span className="text-ink-2">{CAMPAIGN_END_LABEL}.</span>
        </p>
        <Link href="/set-and-earn" className="inline-flex shrink-0 items-center gap-1 font-medium hover:underline">
          <span className="hidden sm:inline">How to take part</span>
          <span className="sm:hidden">Guide</span>
          <Icon.Arrow size={14} />
        </Link>
        <CampaignBarDismiss />
        <CampaignDeadline />
      </div>
    </div>
  );
}
