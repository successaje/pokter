'use client';

import { useEffect } from 'react';

import { CAMPAIGN_ENDS_AT } from '@/lib/campaign/window';

/** The longest delay a browser timer holds; a longer one fires at once. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Marks the campaign closed on a page that is still open when the deadline
 * passes. The boot script only runs on a full load, so a tab left open
 * across 5 November 12:00 UTC went on announcing a live campaign.
 *
 * A timer alone is not enough: one set before a laptop sleeps can wake late,
 * and a page restored from the back-forward cache runs no effects. So the
 * deadline is checked again whenever the page is shown or regains focus.
 */
export function CampaignDeadline() {
  useEffect(() => {
    const root = document.documentElement;
    const check = () => {
      if (Date.now() > CAMPAIGN_ENDS_AT.getTime()) root.dataset.campaign = 'closed';
    };
    check();
    const left = CAMPAIGN_ENDS_AT.getTime() - Date.now() + 1;
    const timer = left > 0 && left <= MAX_TIMER_MS ? window.setTimeout(check, left) : undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('pageshow', check);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
