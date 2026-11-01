import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

import { clockAnchor, DEFAULT_SERVER_NOW } from './support/clock';

import { STORES } from '../../src/lib/health/stores';
import { HOUSE_AGENT_WALLETS } from '../../src/lib/house/wallets';
import { TEST_AGENT } from './support/test-agent.mjs';

/*
 * Tests that drive the real pages in a browser, for behaviour the unit tests
 * can only read from source: what a visitor sees while a page loads, what a
 * cached page shows after a deadline, what the hire flow does with a wallet.
 *
 * They run against a development server of their own on a port nothing else
 * uses, so a dev server already open on 4311 is never reused or disturbed.
 *
 * The server's clock is always set (support/server-clock.mjs), so a test
 * reads the same whatever day it runs: 1 November 2026, 12:00 UTC, while Set
 * and Earn is live. Tests tagged @after-deadline run only when POKTER_TEST_NOW
 * sets it explicitly, so a page renders as it will after a date that has
 * not come yet.
 *
 * Neither side reaches the internet. The server answers from fixtures
 * (support/server-network.mjs); the browser resolves no host but localhost,
 * so anything a test does not stand in for itself fails like a host that
 * does not exist.
 *
 * A third run, POKTER_TEST_SERVER=production, builds the app and serves the
 * build, for the tests tagged @production. Some behaviour exists only there:
 * a development server never prefetches links, so what a click shows before
 * the server answers can only be seen against a build. `npm run test:browser`
 * runs all three.
 *
 * The server never reaches the network. Every request it makes to another
 * host is answered from tests/browser/fixtures/network, and anything without
 * a fixture fails as an unreachable host would (support/server-network.mjs).
 * POKTER_TEST_NETWORK=record fills in missing fixtures from the indexer and
 * BNB Chain nodes, read-only; nothing else is ever reached.
 *
 * Only Pokter's own house agents are opened: opening an outside agent's page
 * on a local server can send that agent a quote request.
 */

// POKTER_TEST_PORT lets two checkouts run their tests at once.
const PORT = Number(process.env.POKTER_TEST_PORT ?? 4391);
const movedTo = process.env.POKTER_TEST_NOW ?? '';
const serverNow = movedTo || DEFAULT_SERVER_NOW;
const production = process.env.POKTER_TEST_SERVER === 'production';
const recording = process.env.POKTER_TEST_NETWORK === 'record';
const only = production ? /@production/ : movedTo ? /@after-deadline/ : undefined;
// One anchor for every server process, so they all agree on the moved time.
const anchor = clockAnchor();
/*
 * A fresh directory for the server's stores on every run, so what one run
 * wrote (a recorded quote, a rate limit, a hire attempt) never changes what
 * the next one renders. Made once, here, and inherited by the workers.
 */
process.env.POKTER_TEST_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'pokter-test-data-'));
const dataDir = process.env.POKTER_TEST_DATA_DIR;

/*
 * The server's environment, pinned so a run on a laptop with `.env.local`
 * and a run in CI without one see the same app (Next lets a variable set
 * here win over the file).
 *
 * It holds no real key. Every secret the app would sign, send or alert with
 * is blank, so nothing it does can move funds, mail anyone or post anywhere,
 * and no house agent has a wallet but Brinkwatch, which is handed the test
 * key (support/test-agent.mjs). The indexer key is kept only while
 * recording, against the indexer's anonymous rate limit; it travels in a
 * header, which no fixture keeps.
 */
const houseKeys = Object.fromEntries(Object.keys(HOUSE_AGENT_WALLETS).map((slug) => [`HOUSE_AGENT_${slug.toUpperCase()}_KEY`, '']));
const serverEnv: Record<string, string> = {
  POKTER_TEST_NOW: serverNow,
  POKTER_TEST_CLOCK_ANCHOR: String(anchor),
  POKTER_TEST_PORT: String(PORT),
  POKTER_TEST_NETWORK: recording ? 'record' : 'replay',
  // One preload for both: Next keeps only the last --import it is given (support/server-preload.mjs).
  NODE_OPTIONS: [
    process.env.NODE_OPTIONS,
    '--import=./tests/browser/support/server-preload.mjs',
  ].filter(Boolean).join(' '),
  NEXT_TELEMETRY_DISABLED: '1',
  ALTANA_NETWORK: 'bnb-testnet',
  NEXT_PUBLIC_ALTANA_NETWORK: '',
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: '',
  ALTANA_ADMIN_KEY: '',
  PRIVATE_KEY: '',
  SWEEP_SCHEDULER: '',
  SWEEP_SECRET: '',
  POKTER_DEMO_WRITE_SECRET: '',
  NODEREAL_API_KEY: '',
  RESEND_API_KEY: '',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_ALERT_CHAT_ID: '',
  ...(recording ? {} : { SCAN_API_KEY: '' }),
  ...houseKeys,
  [`HOUSE_AGENT_${TEST_AGENT.slug.toUpperCase()}_KEY`]: TEST_AGENT.privateKey,
  ...Object.fromEntries(STORES.map((store) => [store.variable, join(dataDir, store.fallback.replace(/^.*\//, ''))])),
};

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
    // Requests a test answers itself (page.route) are answered before any lookup; everything else outside this machine fails.
    launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost'] },
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
    env: serverEnv,
  },
});
