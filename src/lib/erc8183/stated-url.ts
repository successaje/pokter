/**
 * The deliverable URL a seller states when it accepts a funded job.
 *
 * The same URL is on chain in the submission's `optParams`, and reading it
 * back is the obvious thing to do. It does not work for long: recovering
 * it needs `eth_getLogs` over the block the submission landed in, and no
 * free BNB Chain endpoint serves that history. publicnode answers about
 * eight thousand blocks — under two hours at current block times — and
 * then refuses with "Archive requests require a personal token", a
 * message about depth dressed as one about archives; BNB Chain's own
 * dataseed endpoints decline log queries at any width. A sweep every two
 * hours is racing a window it cannot reliably win, so a receipt verified
 * the next day could not find its own deliverable.
 *
 * The seller says the URL in the same breath as accepting, so keeping it
 * costs nothing and removes the dependency.
 *
 * Pure, and kept out of the `server-only` notice module so the handling of
 * this third-party string can be tested: it arrives from somebody else's
 * server and ends up in Pokter's index and on a buyer's screen.
 */

/** Longest URL kept. Past this a seller is not naming a document. */
export const MAX_DELIVERABLE_URL = 500;

export function statedDeliverableUrl(reply: Record<string, unknown>): string | null {
  const stated = reply.deliverable_url ?? reply.deliverableUrl;
  if (typeof stated !== 'string') return null;
  try {
    const url = new URL(stated.trim());
    /* https only: a deliverable fetched in plaintext can be rewritten in
       transit, and a non-http scheme is not a document at all. */
    if (url.protocol !== 'https:') return null;
    return url.href.length > MAX_DELIVERABLE_URL ? null : url.href;
  } catch {
    return null;
  }
}
