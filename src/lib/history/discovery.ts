/**
 * Finding agents nobody has pointed Pokter at.
 *
 * The sweep's roster is the category listings, agents Pokter already
 * measures, agents that asked to be measured or signed a price, and one
 * page of the registry ordered by its own score. A newly registered agent
 * has no score and fits no category until someone looks, so it could sit
 * unmeasured indefinitely.
 *
 * So each run reads the newest registrations since it last looked (a
 * durable cursor, one page of a hundred, a few at most when the registry is
 * busy), queues the ones that declare a protocol Pokter can call, and tries
 * a handful of queued agents. One that answers joins the measured roster;
 * one that does not is tried again later and later, then left alone. The
 * registry is never scanned whole: on BNB Chain it holds over 360,000
 * registrations, most declaring only a website.
 *
 * Pure: the rules here are tested without a store, a registry or a network.
 */

/** Registrations read per page, newest first. */
export const DISCOVERY_PAGE = 100;
/**
 * Pages read in one run at most. BNB Chain took about a registration a
 * minute on 27 October 2026, so a ten-minute run needs one page; three
 * cover a run that follows hours of skipped ones. Beyond that the run says
 * it left a gap rather than reading on.
 */
export const DISCOVERY_MAX_PAGES = 3;
/** Queued agents tried in one run, per chain: a share of the run, not a second sweep. */
export const DISCOVERY_QUOTA = 6;
/**
 * When an agent that did not answer is tried again: an hour, six hours, a
 * day, three days, then weekly. After the last it is dropped from the
 * queue, about four weeks after it was first tried; it remains findable by
 * name or ID, and anything else that puts it on the roster still does.
 */
export const DISCOVERY_BACKOFF_MS: readonly number[] = [1, 6, 24, 72, 168, 168, 168].map((hours) => hours * 3_600_000);

/** Whether a registration declares a protocol Pokter can call: A2A or MCP, as the registry spells either. */
export function declaresCallableProtocol(protocols: readonly string[] | null | undefined): boolean {
  return (protocols ?? []).some((protocol) => /^(?:a2a|mcp)$/i.test(protocol.trim()));
}

/**
 * How far behind the cursor each run reads again. The indexer can list a
 * registration some minutes after its block time, and one listed after the
 * cursor passed it would otherwise never be seen. Re-reading costs nothing
 * extra (it is on the page already read), and anything already queued or
 * measured is left as it is.
 */
export const DISCOVERY_OVERLAP_MS = 30 * 60_000;

/**
 * The registrations on a page to consider, and whether the page reached
 * back past the window.
 *
 * Considered: everything registered within `DISCOVERY_OVERLAP_MS` of the
 * cursor or after it. A page with nothing older than that means more
 * arrived than one page holds, so the next page is read too. With no cursor
 * yet (the first run) only this page counts: discovery starts from now, it
 * does not backfill.
 */
export function newerThanCursor<T extends { created_at: string }>(items: readonly T[], cursor: string | null): { fresh: T[]; reachedCursor: boolean } {
  if (cursor === null) return { fresh: [...items], reachedCursor: true };
  const from = Date.parse(cursor) - DISCOVERY_OVERLAP_MS;
  const fresh = items.filter((item) => Date.parse(item.created_at) >= from);
  return { fresh, reachedCursor: fresh.length < items.length };
}

/** The newest registration time among some, or the cursor when none is newer. */
export function advanceCursor(cursor: string | null, items: readonly { created_at: string }[]): string | null {
  let newest = cursor;
  for (const item of items) {
    if (!Number.isFinite(Date.parse(item.created_at))) continue;
    if (newest === null || Date.parse(item.created_at) > Date.parse(newest)) newest = item.created_at;
  }
  return newest;
}

export type DiscoveryState = 'queued' | 'promoted' | 'dropped';

export type DiscoveryResult = 'answered' | 'no-answer' | 'no-endpoint' | 'not-callable';

/**
 * How a try ended. `not-callable`: the endpoint answered, and every answer
 * said it cannot be called (it needs credentials, or is not an agent
 * endpoint), which no retry changes. Silence, a timeout or a server error
 * is `no-answer`, which a later try may change.
 */
export function discoveryResult(reading: { answered: number; probes?: ReadonlyArray<{ ok: boolean; uncallable?: string }> } | null): Exclude<DiscoveryResult, 'no-endpoint'> {
  if (reading && reading.answered > 0) return 'answered';
  const probes = reading?.probes ?? [];
  if (probes.length > 0 && probes.every((probe) => !probe.ok && probe.uncallable !== undefined)) return 'not-callable';
  return 'no-answer';
}

/**
 * What one try decides. `answered` promotes the agent to the roster; no
 * callable endpoint, declared or answered, drops it at once; silence
 * schedules the next try or, after the last, drops it.
 */
export function afterDiscoveryAttempt(
  previousAttempts: number,
  result: DiscoveryResult,
  now: number,
): { state: DiscoveryState; attempts: number; nextAttemptAt: string | null } {
  const attempts = previousAttempts + 1;
  if (result === 'answered') return { state: 'promoted', attempts, nextAttemptAt: null };
  if (result === 'no-endpoint' || result === 'not-callable') return { state: 'dropped', attempts, nextAttemptAt: null };
  const wait = DISCOVERY_BACKOFF_MS[attempts - 1];
  if (wait === undefined) return { state: 'dropped', attempts, nextAttemptAt: null };
  return { state: 'queued', attempts, nextAttemptAt: new Date(now + wait).toISOString() };
}
