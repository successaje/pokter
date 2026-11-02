import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { alignBrowserClock } from './support/clock';
import { mockChain } from './support/mock-chain';
import { installMockWallet, SIGNING_METHODS, walletCalls } from './support/mock-wallet';

const BUYER = '0x89D29fbf9F3B6E727530231438f80d556ff2d905' as const;
const PROVIDER = '0x93847647d7eb72a69E162117df6a8697dF53EDda';
const JOBS = [
  { chainId: 97, jobId: '990097', name: 'Recovered testnet job', token: '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565' },
  { chainId: 56, jobId: '990056', name: 'Recovered mainnet job', token: '0xcE24439F2D9C6a2289F741120FE202248B666666' },
] as const;

test('jobs on both escrows return after the buyer clears browser storage and reconnects', async ({ page }) => {
  test.setTimeout(120_000);
  // The first read opens the same SQLite store the server will use below.
  expect((await page.request.get(`/api/jobs?client=${BUYER}`)).ok()).toBe(true);
  execFileSync(process.execPath, [resolve('tests/browser/support/seed-job-index.mjs')], {
    input: JSON.stringify({ buyer: BUYER, provider: PROVIDER, jobs: JOBS }),
    env: process.env,
  });

  await alignBrowserClock(page);
  await installMockWallet(page, { address: BUYER, chainId: 97 });
  await page.route((url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1', (route) => route.abort('blockedbyclient'));
  await mockChain(page, {
    chainId: 56,
    now: Date.parse('2026-11-01T12:00:00.000Z') / 1000,
    jobs: {
      '990056': { client: BUYER, status: 'EXPIRED', expiredAt: Date.parse('2026-10-15T16:10:33.000Z') / 1000 },
    },
  });
  await page.goto('/workspace/jobs');
  for (const job of JOBS) {
    await expect(page.getByRole('link', { name: new RegExp(job.name) })).toHaveAttribute('href', `/workspace/jobs/${job.jobId}?chain=${job.chainId}`);
  }

  // Simulate a device whose Pokter data was cleared. The wallet reconnects
  // on reload, but neither job is left in this browser's saved-job list.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem('pokter.jobs.v1'))).toBeNull();
  for (const job of JOBS) {
    await expect(page.getByRole('link', { name: new RegExp(job.name) })).toHaveAttribute('href', `/workspace/jobs/${job.jobId}?chain=${job.chainId}`);
  }
  expect((await walletCalls(page)).filter((call) => SIGNING_METHODS.includes(call.method))).toEqual([]);

  await page.getByRole('link', { name: /Recovered mainnet job/ }).click();
  await expect(page.getByText('Expired · refunded', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Reclaim/ })).toHaveCount(0);
});

test('recover by number searches mainnet even when the connected wallet is on testnet', async ({ page }) => {
  await alignBrowserClock(page);
  await installMockWallet(page, { address: BUYER, chainId: 97 });
  await page.route((url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1', (route) => route.abort('blockedbyclient'));
  const asked = new Set<number>();
  await page.route((url) => url.pathname === '/api/jobs/777', async (route) => {
    const chainId = Number(new URL(route.request().url()).searchParams.get('chain'));
    asked.add(chainId);
    if (chainId !== 56) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No job here.' }) });
    const job = {
      id: '56:777', jobId: '777', chainId: 56, isTestnet: false,
      agentChainId: 56, agentTokenId: '2618', agentName: 'Recovered mainnet job',
      provider: PROVIDER, task: 'A funded job to recover', budgetRaw: '100000000000000000',
      expiredAt: '2026-10-15T16:10:33.000Z', hiredAt: '2026-10-01T10:00:00.000Z',
      hireTxHash: null, status: 'FUNDED', statusCheckedAt: '2026-11-01T10:00:00.000Z',
      deliverableUrl: null, settleTxHash: null,
    };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ client: BUYER, job }) });
  });

  await page.goto('/workspace/jobs');
  await page.getByRole('textbox', { name: 'Job number' }).fill('777');
  await page.getByRole('button', { name: 'Recover', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/jobs\/777\?chain=56/);
  expect([...asked].sort()).toEqual([56, 97]);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pokter.jobs.v1') ?? '[]')) as Array<{ walletAddress: string; job: { jobId: string; chainId: number } }>;
  expect(saved.some((entry) => entry.walletAddress.toLowerCase() === BUYER.toLowerCase() && entry.job.jobId === '777' && entry.job.chainId === 56)).toBe(true);
  expect((await walletCalls(page)).filter((call) => SIGNING_METHODS.includes(call.method))).toEqual([]);
});
