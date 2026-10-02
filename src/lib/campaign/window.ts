/**
 * When the Set and Earn campaign is actually on.
 *
 * The end was written as the string "Ends 5 Nov · 12:00 UTC" in two
 * components and nothing anywhere compared it to the time. The banners are
 * unconditional, so on 6 November the landing page and the activity page
 * would both have gone on announcing that the campaign is live and ends on a
 * date already past — a false claim on a timer, in a product whose argument
 * is that it does not publish things it cannot stand behind.
 *
 * One timestamp, one label derived from it, one predicate. Not `server-only`:
 * the banners that read it render on both sides.
 */

/** 5 November 2026, 12:00 UTC — the published deadline. */
export const CAMPAIGN_ENDS_AT = new Date('2026-11-05T12:00:00Z');

/**
 * Rendered from the timestamp rather than retyped beside it, so the sentence
 * and the behaviour cannot drift apart. Fixed to UTC: the deadline is a
 * single moment for everyone, and localising it would show each reader a
 * different hour for the same cut-off.
 */
export const CAMPAIGN_END_LABEL = `Ends ${CAMPAIGN_ENDS_AT.toLocaleDateString(
  'en-GB',
  { day: 'numeric', month: 'short', timeZone: 'UTC' },
)} · ${CAMPAIGN_ENDS_AT.toLocaleTimeString('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})} UTC`;

/** Whether the campaign is still running. The boundary itself is still live. */
export function isCampaignLive(now: Date = new Date()): boolean {
  return now.getTime() <= CAMPAIGN_ENDS_AT.getTime();
}
