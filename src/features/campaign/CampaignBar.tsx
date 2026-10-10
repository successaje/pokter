import Link from 'next/link';

import { CAMPAIGN_END_LABEL, isCampaignLive } from '@/lib/campaign/window';
import { Icon } from '@/ui/icons';
import { CampaignBarDismiss } from './CampaignBarDismiss';

/*
 * The strip above the public header that tells a first-time visitor the
 * campaign is on. Static pages are built once, so the server's "is it live"
 * can be stale: the root layout's boot script re-checks the deadline before
 * first paint and honours a dismissal, so neither ever flashes.
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
        <p className="min-w-0 flex-1">
          <strong className="font-semibold">BNB Chain Set and Earn is live.</strong>{' '}
          <span className="hidden sm:inline">Hire three agents and build one of your own to qualify. </span>
          <span className="text-ink-2">{CAMPAIGN_END_LABEL}.</span>
        </p>
        <Link href="/set-and-earn" className="inline-flex shrink-0 items-center gap-1 font-medium hover:underline">
          <span className="hidden sm:inline">How to take part</span>
          <span className="sm:hidden">Guide</span>
          <Icon.Arrow size={14} />
        </Link>
        <CampaignBarDismiss />
      </div>
    </div>
  );
}
