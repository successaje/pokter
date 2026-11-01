import { defineConfig, devices } from '@playwright/test';

/*
 * Tests that drive the real pages in a browser, for behaviour the unit tests
 * can only read from source: what a visitor sees while a page loads, what a
 * cached page shows after a deadline, what the hire flow does with a wallet.
 *
 * They run against a development server of their own on a port nothing else
 * uses, so a dev server already open on 4311 is never reused or disturbed.
 *
 * Two runs, two server clocks. Most tests run with the server on real time.
 * Those tagged @after-deadline run only when POKTER_TEST_NOW moves the
 * server's clock (support/server-clock.mjs), so a page can be rendered as it
 * will be after a date that has not happened yet.
 *
 * A third run, POKTER_TEST_SERVER=production, builds the app and serves the
 * build, for the tests tagged @production. Some behaviour exists only there:
 * a development server never prefetches links, so what a click shows before
 * the server answers can only be seen against a build. `npm run test:browser`
 * runs all three.
 *
 * Only Pokter's own house agents are opened: opening an outside agent's page
 * on a local server can send that agent a quote request.
 */

// POKTER_TEST_PORT lets two checkouts run their tests at once.
const PORT = Number(process.env.POKTER_TEST_PORT ?? 4391);
const serverNow = process.env.POKTER_TEST_NOW ?? '';
const production = process.env.POKTER_TEST_SERVER === 'production';
const only = production ? /@production/ : serverNow ? /@after-deadline/ : undefined;
// One anchor for every server process, so they all agree on the moved time.
process.env.POKTER_TEST_CLOCK_ANCHOR ??= String(Date.now());

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: '../../.playwright/results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  grep: only,
  grepInvert: only ? undefined : /@after-deadline|@production/,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: production ? `npx next build --webpack && npx next start --hostname localhost --port ${PORT}` : `npx next dev --hostname localhost --port ${PORT}`,
    cwd: '../..',
    // Not /api/health: a build without a persistent volume reports itself degraded (503), and is still fine to test.
    url: `http://localhost:${PORT}/robots.txt`,
    reuseExistingServer: false,
    timeout: production ? 900_000 : 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      POKTER_TEST_NOW: serverNow,
      POKTER_TEST_CLOCK_ANCHOR: process.env.POKTER_TEST_CLOCK_ANCHOR,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, serverNow ? '--import=./tests/browser/support/server-clock.mjs' : ''].filter(Boolean).join(' '),
    },
  },
});
