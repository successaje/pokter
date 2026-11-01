import type { Page } from '@playwright/test';

/*
 * One clock for the server, the browser and the mock chain.
 *
 * The test server's clock is moved to a fixed instant (server-clock.mjs) and
 * runs on from there, measured from an anchor every process shares. A test
 * that left the browser and the chain on real time saw three different
 * "nows": a quote the server signed for fifteen minutes on 1 November
 * read as expired in a browser on any later day, and a chain a day apart
 * from both judged deadlines its own way.
 */

/** The server's "now" when a run does not move it: a fixed day while Set and Earn is live. */
export const DEFAULT_SERVER_NOW = '2026-11-01T12:00:00.000Z';

/** The anchor every process measures elapsed time from; set once, by the config, for the whole run. */
export function clockAnchor(): number {
  process.env.POKTER_TEST_CLOCK_ANCHOR ??= String(Date.now());
  return Number(process.env.POKTER_TEST_CLOCK_ANCHOR);
}

/** What the test server's clock reads at this moment, in milliseconds. */
export function serverNowMs(): number {
  const start = Date.parse(process.env.POKTER_TEST_NOW || DEFAULT_SERVER_NOW);
  return start + (Date.now() - clockAnchor());
}

/** The same moment as the chain's head block timestamp, in seconds. */
export function chainNowSeconds(): number {
  return Math.floor(serverNowMs() / 1000);
}

/** Starts the page's clock at the server's time, running. Call before the first navigation. */
export async function alignBrowserClock(page: Page): Promise<number> {
  const now = serverNowMs();
  await page.clock.install({ time: now });
  return now;
}
