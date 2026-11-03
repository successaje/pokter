import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import { keccak256, stringToBytes } from 'viem';

import { readDeliveredAnswer } from '../../src/lib/delivery/answer';
import { checkDeliveredPlan } from '../../src/lib/delivery/plan-checks';
import { alignBrowserClock, chainNowSeconds } from './support/clock';
import { mockChain } from './support/mock-chain';
import { installMockWallet, SIGNING_METHODS, walletCalls } from './support/mock-wallet';

const BUYER = '0x89D29fbf9F3B6E727530231438f80d556ff2d905' as const;
const PROVIDER = '0x93847647d7eb72a69E162117df6a8697dF53EDda' as const;
const JOB_ID = '990585';
const SUBMITTED_AT = Date.parse('2026-11-01T11:55:00.000Z') / 1000;
const EXPIRED_AT = Date.parse('2026-11-10T12:00:00.000Z') / 1000;
const manifest = readFileSync(resolve('tests/fixtures/deliverable-1585.json'), 'utf8');
const manifestHash = keccak256(stringToBytes(manifest));
const checks = checkDeliveredPlan(manifest);
if (!checks || !checks.checks.some((check) => check.outcome === 'failed')) throw new Error('The recorded delivery must contain a failed Pokter check.');

async function openDeliveredJob(page: Page, initiallyMissingToken = false) {
  await alignBrowserClock(page);
  await installMockWallet(page, { address: BUYER, chainId: 97 });
  await page.route((url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1', (route) => route.abort('blockedbyclient'));
  await mockChain(page, {
    chainId: 97,
    now: chainNowSeconds(),
    disputeWindow: 900,
    jobs: {
      [JOB_ID]: { client: BUYER, provider: PROVIDER, status: 'SUBMITTED', submittedAt: SUBMITTED_AT, expiredAt: EXPIRED_AT, budget: 100000000000000000n, deliverable: manifestHash },
    },
  });
  const job = {
    id: `97:${JOB_ID}`, jobId: JOB_ID, chainId: 97, isTestnet: true,
    agentChainId: 97, agentTokenId: '2618', agentName: 'Research agent',
    client: BUYER, provider: PROVIDER, task: 'Research an agent marketplace',
    budgetRaw: '100000000000000000', hiredAt: '2026-11-01T11:00:00.000Z',
    paymentToken: '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565',
    expiredAt: new Date(EXPIRED_AT * 1000).toISOString(),
    status: 'SUBMITTED', statusCheckedAt: '2026-11-01T12:00:00.000Z',
    deliverableUrl: 'https://example.com/recorded-delivery.json',
    disputeTxHash: null, settleTxHash: null, reclaimTxHash: null,
  };
  await page.route((url) => url.pathname === '/api/jobs' && url.searchParams.has('client'), (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jobs: [] }) }));
  let lookups = 0;
  await page.route((url) => url.pathname === `/api/jobs/${JOB_ID}`, (route) => {
    const responseJob = initiallyMissingToken && lookups++ === 0 ? { ...job, paymentToken: null } : job;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ client: BUYER, job: responseJob }) });
  });
  await page.route((url) => url.pathname === `/api/jobs/${JOB_ID}/answer`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    delivered: true, readable: true, matchesChain: true, matchedBy: 'exact', manifestHash,
    answer: readDeliveredAnswer(manifest), checks, funder: 'outside', published: false,
  }) }));
  await page.route((url) => url.pathname === `/api/jobs/${JOB_ID}/report-check`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ applies: false, reason: 'Not a Venus report.' }) }));
  await page.route((url) => url.pathname === '/api/deliverables/verify', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ verified: true }) }));
  await page.route((url) => url.pathname === '/api/notifications/event', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
  await page.goto(`/workspace/jobs/${JOB_ID}?chain=97`);
}

test('the release panel resolves an older job’s missing currency before displaying the amount', async ({ page }) => {
  await openDeliveredJob(page, true);
  await expect(page.getByText('0.1 $U', { exact: true })).toBeVisible();
  await expect(page.getByText(/base units/)).toHaveCount(0);
  await expect(page.getByText('Checking currency…')).toHaveCount(0);
});

test('a failed delivery check leads the buyer to a deliberate dispute, and wallet rejection changes nothing', async ({ page }) => {
  await openDeliveredJob(page);
  const findings = page.getByRole('region', { name: 'Pokter’s checks on this answer' });
  await expect(findings).toContainText('Failed');
  await expect(findings).toContainText('does not decide the escrow');
  await expect(page.getByText('0.1 $U', { exact: true })).toBeVisible();
  await expect(page.getByText(/base units/)).toHaveCount(0);
  await expect(findings.getByRole('link', { name: 'Review your dispute option' })).toHaveAttribute('href', '#now-title');
  if (process.env.POKTER_PREVIEW_SHOT) await page.screenshot({ path: process.env.POKTER_PREVIEW_SHOT, fullPage: true });
  const dispute = page.getByRole('button', { name: 'Open a dispute' });
  await expect(dispute).toBeDisabled();
  expect((await walletCalls(page)).filter((call) => SIGNING_METHODS.includes(call.method))).toEqual([]);

  await findings.getByRole('link', { name: 'Review your dispute option' }).click();
  await page.getByRole('checkbox', { name: 'It did not deliver what I asked' }).check();
  await expect(dispute).toBeEnabled();
  await dispute.click();
  await expect(dispute).toBeEnabled();
  const signed = (await walletCalls(page)).filter((call) => SIGNING_METHODS.includes(call.method));
  expect(signed).toHaveLength(1);
  expect(signed[0].outcome).toBe('refused');
  await expect(page.getByRole('button', { name: 'Open a dispute' })).toBeEnabled();
});

test('@after-deadline a failed check cannot open a dispute once the review window has closed', async ({ page }) => {
  await openDeliveredJob(page);
  const findings = page.getByRole('region', { name: 'Pokter’s checks on this answer' });
  await expect(findings).toContainText('The review window has closed, so a new dispute cannot be opened.');
  await expect(findings.getByRole('link', { name: 'Review your dispute option' })).toHaveCount(0);
  await expect(page.getByText('Dispute window closed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Release 0.1 $U to Research agent' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'It did not deliver what I asked' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open a dispute' })).toHaveCount(0);
  expect((await walletCalls(page)).filter((call) => SIGNING_METHODS.includes(call.method))).toEqual([]);
});
