import { expect, test, type Page } from '@playwright/test';

import { mockChain, type MockJob } from './support/mock-chain';
import { installMockWallet, SIGNING_METHODS, walletCalls } from './support/mock-wallet';

/*
 * The hire page, with a wallet whose stored payment record this browser
 * cannot read. A record like that may stand for a payment that went
 * through, so the page must not treat it as "nothing recorded": it says so,
 * asks the wallet for nothing, keeps the record exactly as stored, and sets
 * it aside only when the chain proves no payment from it can still happen.
 *
 * The wallet and the chain are both mocked (support/), so nothing here signs,
 * sends or reads a real node. The agent is a house agent on testnet.
 */

const WALLET = '0x3333333333333333333333333333333333333333' as const;
const KEY = `pokter:funding-attempt:97:${WALLET}`;
const NOW = Date.parse('2026-11-01T12:00:00Z') / 1000;
const HIRE = '/hire/97/2618';
const PAYEE = '0x93847647d7eb72a69E162117df6a8697dF53EDda' as const;
/** The record's own brief and quote: what binds a job on chain to it. */
const BRIEF = 'earlier brief + quote';

/** Complete except for `prompt`, which decides whether a payment could still follow. */
const missingPrompt = JSON.stringify({
  attemptId: 'earlier', ownerTab: 'gone', wallet: WALLET, chainId: 97, provider: '0x93847647d7eb72a69E162117df6a8697dF53EDda',
  agent: { chainId: 97, tokenId: '2618', name: 'House agent' }, task: 'Earlier task', description: 'earlier brief + quote', token: '0x93847647d7eb72a69E162117df6a8697dF53EDda',
  amountRaw: '1000', fundableUntil: NOW + 86_400, startedAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z',
  predictedJobId: '105', jobId: '105', callsId: null, txHashes: [], state: 'pending',
});

async function openWith(page: Page, record: string, jobs: Record<string, MockJob>) {
  await installMockWallet(page, { address: WALLET, chainId: 97 });
  await mockChain(page, { chainId: 97, now: NOW, jobs });
  await page.addInitScript(
    ({ key, record }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(key, record);
    },
    { key: KEY, record },
  );
  await page.goto(HIRE);
}

const notice = (page: Page) => page.getByRole('status').filter({ hasText: 'An earlier payment record on this browser cannot be read' });
const stored = (page: Page, key = KEY) => page.evaluate((k) => localStorage.getItem(k), key);
const signingRequests = async (page: Page) => (await walletCalls(page)).filter((c) => SIGNING_METHODS.includes(c.method));

test.describe('a stored payment record this browser cannot read', () => {
  test.setTimeout(120_000);

  test('blocks funding while the job it names can still be paid, and keeps the record', async ({ page }) => {
    await openWith(page, missingPrompt, { '105': { client: WALLET, provider: PAYEE, description: BRIEF, status: 'OPEN', expiredAt: NOW + 3_600 } });
    await expect(notice(page)).toBeVisible();
    await expect(notice(page)).toContainText('The record does not say which wallet request was last made.');
    await expect(notice(page)).toContainText('Job 105 from this wallet carries its brief and quote and is open on chain until 1 Nov, 13:00 UTC.');
    expect(await stored(page)).toBe(missingPrompt);
    expect(await signingRequests(page)).toEqual([]);

    await notice(page).getByRole('button', { name: 'Check the chain again' }).click();
    await expect(notice(page)).toBeVisible();
    expect(await stored(page)).toBe(missingPrompt);
  });

  test('is set aside, not deleted, once the chain shows the job it names was funded, and its quote stays paid', async ({ page }) => {
    await openWith(page, missingPrompt, { '105': { client: WALLET, provider: PAYEE, description: BRIEF, status: 'FUNDED', expiredAt: NOW + 3_600 } });
    const resolved = page.getByRole('status').filter({ hasText: 'The earlier payment record is resolved' });
    await expect(resolved).toBeVisible();
    await expect(resolved).toContainText('Job 105 from this wallet carries its brief and quote and is past funding on chain (funded)');
    await expect(notice(page)).toHaveCount(0);
    expect(await stored(page)).toBeNull();
    const asideKeys = await page.evaluate((k) => Object.keys(localStorage).filter((key) => key.startsWith(`${k}:set-aside:`)), KEY);
    expect(asideKeys).toHaveLength(1);
    const aside = JSON.parse((await stored(page, asideKeys[0]))!);
    expect(aside.raw).toBe(missingPrompt);
    expect(aside.rule).toBe('job-funded');
    const paid = JSON.parse((await stored(page, `pokter:funded-attempts:97:${WALLET}`))!);
    expect(paid).toEqual([expect.objectContaining({ jobId: '105', until: NOW + 3_600 })]);
    expect(await signingRequests(page)).toEqual([]);
  });

  test('stays when the funded job it names carries a different brief and quote', async ({ page }) => {
    await openWith(page, missingPrompt, { '105': { client: WALLET, provider: PAYEE, description: 'an older brief + quote', status: 'FUNDED', expiredAt: NOW + 3_600 } });
    await expect(notice(page)).toBeVisible();
    await expect(notice(page)).toContainText('No job on chain carries its brief and quote');
    expect(await stored(page)).toBe(missingPrompt);
    expect(await signingRequests(page)).toEqual([]);
  });

  test('that is not readable at all stays, says no job can be shown to be its payment, and is left exactly as it was', async ({ page }) => {
    const broken = '{"attemptId":"earlier","wallet":"0x3333';
    await openWith(page, broken, {});
    await expect(notice(page)).toBeVisible();
    await expect(notice(page)).toContainText('The record is not readable data.');
    await expect(notice(page)).toContainText('Its brief and quote cannot be read, so no job on chain can be shown to be its payment.');
    await page.reload();
    await expect(notice(page)).toBeVisible();
    expect(await stored(page)).toBe(broken);
    expect(await signingRequests(page)).toEqual([]);
  });

  test('can be copied exactly as stored', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWith(page, missingPrompt, { '105': { client: WALLET, provider: PAYEE, description: BRIEF, status: 'OPEN', expiredAt: NOW + 3_600 } });
    await notice(page).getByRole('button', { name: 'Copy the record' }).click();
    await expect(notice(page).getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(missingPrompt);
  });
});
