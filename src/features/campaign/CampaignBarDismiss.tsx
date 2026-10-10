'use client';

import { CAMPAIGN_BAR_KEY } from '@/lib/campaign/bar';
import { Icon } from '@/ui/icons';

/** Hides the campaign strip for this browser. The guide stays in the footer. */
export function CampaignBarDismiss() {
  return (
    <button
      type="button"
      aria-label="Hide the Set and Earn notice"
      className="grid size-7 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-ink/10 hover:text-ink"
      onClick={() => {
        document.documentElement.dataset.campaignBar = 'hidden';
        try {
          window.localStorage.setItem(CAMPAIGN_BAR_KEY, 'hidden');
        } catch {
          /* Hidden for this page only. */
        }
      }}
    >
      <Icon.Close size={14} />
    </button>
  );
}
