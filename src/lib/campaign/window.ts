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

/** 1 October 2026 — the published start of the campaign window. */
export const CAMPAIGN_STARTS_AT = new Date('2026-10-01T00:00:00Z');

/**
 * The cut-off for a listing to count, which is not the campaign start.
 *
 * The official rules exclude "agents listed before our official Phase 2
 * announcement on X". That announcement went out on 2 October, a day after
 * the window opened, so the two dates are not the same and the campaign
 * start is the wrong one to test against — using it would tell a builder
 * who registered on 1 October that they were fine when the rules say
 * otherwise, which is the direction that costs them the entry.
 *
 * The hour is approximate: X showed the post at 9pm in the reader's own
 * timezone and exposes no machine-readable timestamp on that view. Nothing
 * currently turns on the precision — of the 79 listed agents, 77 were
 * registered before 1 October and none between then and now — so the
 * uncertain band is empty. If that changes, read the exact time from the
 * post rather than trusting this constant.
 *
 * https://x.com/BNBCHAIN/status/2106112011662938207
 */
export const PHASE_2_ANNOUNCED_AT = new Date('2026-10-02T21:00:00Z');

/** 5 November 2026, 12:00 UTC — the published deadline. */
export const CAMPAIGN_ENDS_AT = new Date('2026-11-05T12:00:00Z');

/**
 * Whether an agent was registered inside the campaign window.
 *
 * Null when the registry reports no creation date, which is two of the
 * seventy-nine listed today — "we cannot tell" is not "it does not count",
 * and an agent should not be marked ineligible by a missing field.
 */
export function registeredInCampaign(createdAt: string | null | undefined): boolean | null {
  if (!createdAt) return null;
  const at = Date.parse(createdAt);
  if (!Number.isFinite(at)) return null;
  return at >= PHASE_2_ANNOUNCED_AT.getTime();
}

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

/**
 * BNB Chain's own rules page — the authority for every campaign claim
 * Pokter makes.
 *
 * Shared because three surfaces link to it and a campaign URL that drifts
 * between them sends somebody to a 404 at the moment they are checking
 * whether to trust what we said about the rules.
 */
export const CAMPAIGN_RULES_URL =
  'https://www.bnbchain.org/en/hackathons/smart-money-era-set-and-earn';
