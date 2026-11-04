import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parseUnits } from 'viem';
import { isHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { installMockWallet, SIGNING_METHODS, walletCalls } from './support/mock-wallet';
import { alignBrowserClock, chainNowSeconds } from './support/clock';
import { mockChain } from './support/mock-chain';
import { BUYER, TESTNET_ESCROW } from './support/funding-gate';
import { TEST_AGENT } from './support/test-agent.mjs';
import { EMPTY_PROFILE } from '../../src/lib/profiles/model';
import { profileUploadMessage } from '../../src/lib/profiles/model';

const unclaimed = '0x00000000000000000000000000000000000000bb' as const;

test('profile image uploads require a fresh signature for the exact bytes', async ({ request }) => {
  const owner = privateKeyToAccount(`0x${'45'.repeat(32)}`);
  const image = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const changed = Buffer.from('89504e470d0a1a0a0000000d49484453', 'hex');
  const unsigned = await request.post('/api/profiles/avatar', { data: image });
  expect(unsigned.status()).toBe(401);
  const challengeResponse = await request.put('/api/profiles', { data: { wallet: owner.address, chainId: 97 } });
  const { challenge } = await challengeResponse.json() as { challenge: { id: string; suffix: string } };
  const hash = createHash('sha256').update(image).digest('hex');
  const signature = await owner.signMessage({ message: profileUploadMessage(owner.address, 97, hash) + challenge.suffix });
  const headers = { 'x-pokter-wallet': owner.address, 'x-pokter-chain': '97', 'x-pokter-signature': signature, 'x-pokter-challenge': challenge.id };
  expect((await request.post('/api/profiles/avatar', { data: changed, headers })).status()).toBe(403);
  const uploaded = await request.post('/api/profiles/avatar', { data: image, headers });
  expect(uploaded.status()).toBe(201);
  expect((await uploaded.json() as { id: string }).id).toBe(hash);
  expect((await request.post('/api/profiles/avatar', { data: image, headers })).status()).toBe(409);
});

test('an unclaimed wallet has a public default profile but cannot receive a directed request', async ({ page }) => {
  await installMockWallet(page, { address: unclaimed, chainId: 97 });
  await page.goto(`/builders/${unclaimed}`);
  await expect(page.getByRole('region', { name: 'Builder storefront header' }).getByRole('heading', { name: /0x0000.*00bb/i })).toBeVisible();
  await expect(page.getByText('Unclaimed profile', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Builder profile sections' }).getByRole('link', { name: 'Agents (0)' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'Request custom work' })).toHaveCount(0);
  await page.goto(`/workspace/requests/new?builder=${unclaimed}`);
  await expect(page.getByRole('heading', { name: 'This builder cannot receive a directed request yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview request' })).toHaveCount(0);
  expect((await walletCalls(page)).filter((call) => SIGNING_METHODS.includes(call.method))).toEqual([]);
});

test('builder tabs switch in place, keep scroll, and respect browser history', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(`/builders/${unclaimed}`);
  const firstLoad = await page.evaluate(() => performance.timeOrigin);
  const tabs = page.getByRole('navigation', { name: 'Builder profile sections' });
  await page.evaluate(() => window.scrollTo({ top: 120, behavior: 'instant' }));
  const previousScroll = await page.evaluate(() => window.scrollY);
  expect(previousScroll).toBeGreaterThan(0);

  await tabs.getByRole('link', { name: 'Services' }).click();
  await expect(page).toHaveURL(/tab=services/);
  await expect(page.getByRole('heading', { name: 'No published services' })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(firstLoad);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await page.goBack();
  await expect(tabs.getByRole('link', { name: 'Agents (0)' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Agents owned by this wallet' })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(firstLoad);
});

test('service catalogue shows only published offers and preserves usable search navigation', async ({ page }) => {
  await page.goto('/services');
  await expect(page.getByRole('heading', { name: 'Find a service.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No services published yet' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search services' }).fill('risk');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/services\?q=risk/);
  await expect(page.getByRole('heading', { name: 'No services match your search' })).toBeVisible();
});

test('local service preview stays separate from real offers and cannot start a hire', async ({ page }) => {
  await page.goto('/services?preview=1');
  await expect(page.getByText('These sample services are not published and cannot be hired.')).toBeVisible();
  await expect(page.getByTitle('BNB Chain · Mainnet')).toHaveClass(/bg-ok-wash/);
  await expect(page.getByTitle('BNB Chain · Testnet').first()).toHaveClass(/bg-watch-wash/);
  await page.getByRole('searchbox', { name: 'Search services' }).fill('scenario notes');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Grid strategy review' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Health factor review' })).toHaveCount(0);
  await page.goto('/services?preview=1');
  await expect(page.getByRole('heading', { name: 'Health factor review' })).toBeVisible();
  await page.getByRole('link', { name: 'Health factor review' }).click();
  await expect(page).toHaveURL(/\/services\/preview\/health-factor-review$/);
  await expect(page.getByText('Preview only · hiring is unavailable')).toBeVisible();
  await page.getByRole('link', { name: 'View real services' }).click();
  await expect(page).toHaveURL(/\/services$/);
  await expect(page.getByRole('heading', { name: 'No services published yet' })).toBeVisible();
});

test('Building leads to service publishing and old editor links keep their target', async ({ page }) => {
  await page.goto('/services');
  await page.getByRole('link', { name: 'Publish a service' }).click();
  await expect(page).toHaveURL(/\/build\/services\/new$/);
  await expect(page.getByRole('heading', { name: 'Publish a service' })).toBeVisible();

  await page.goto('/build');
  await page.getByRole('link', { name: 'Set up a service' }).click();
  await expect(page).toHaveURL(/\/build\/services$/);
  await expect(page.getByRole('heading', { name: 'My services' })).toBeVisible();
  await expect(page.getByText('Verify your wallet to see your services')).toBeVisible();

  await page.goto(`/workspace/services/new?builder=${unclaimed}`);
  await expect(page).toHaveURL(new RegExp(`/build/services/new\\?builder=${unclaimed}`, 'i'));
  await expect(page.getByRole('heading', { name: 'Publish a service' })).toBeVisible();
});

test('Requests & Services menu closes outside, on Escape and after navigation', async ({ page }) => {
  await page.goto('/services');
  const menu = page.getByRole('button', { name: /Requests & Services/ });
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.mouse.click(1000, 550);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await page.getByRole('link', { name: /Requests Browse work/ }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

test('builder, service and request pages fit a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, title, file] of [
    [`/builders/${unclaimed}`, /0x0000.*00bb/i, 'builder'],
    ['/services', 'Find a service.', 'services'],
    ['/requests', 'Find work to build.', 'requests'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (file === 'builder') {
      await page.getByRole('region', { name: 'Builder storefront header' }).getByRole('button', { name: 'Share' }).click();
      await expect(page.getByRole('dialog', { name: 'Share this profile' })).toBeVisible();
      expect(await page.evaluate(() => {
        const header = document.querySelector('[aria-label="Builder storefront header"]')!;
        const dialog = document.querySelector('[role="dialog"][aria-label="Share this profile"]')!;
        const box = dialog.getBoundingClientRect();
        const headerBottom = header.getBoundingClientRect().bottom;
        return box.bottom > headerBottom + 12 && dialog.contains(document.elementFromPoint(box.left + 24, headerBottom + 12));
      })).toBe(true);
      await page.screenshot({ path: '/tmp/pokter-builder-share-mobile.png', fullPage: true });
      await page.getByRole('region', { name: 'Builder storefront header' }).getByRole('button', { name: 'Share' }).click();
    }
    await page.screenshot({ path: `/tmp/pokter-${file}-mobile.png`, fullPage: true });
  }
});

test('a persisted service supplies an editable brief to the existing signed quote review', async ({ page }) => {
  test.setTimeout(180_000);
  const path = join(process.env.POKTER_TEST_DATA_DIR!, 'services.db');
  const id = '11111111-1111-4111-8111-111111111111';
  const content = { title: 'Venus position review', description: 'Read a Venus Core Pool position and explain its health factor.', buyerProvides: 'A BNB Chain wallet address', delivers: 'A health factor report and repay plan', category: 'health-factor', chainId: 97, tokenId: TEST_AGENT.tokenId, status: 'active' };
  execFileSync(process.execPath, ['-e', `const {DatabaseSync}=require('node:sqlite'); const [path,id,raw]=process.argv.slice(1); const content=JSON.parse(raw); const db=new DatabaseSync(path); db.exec("CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY,builder TEXT NOT NULL,chain_id INTEGER NOT NULL,token_id TEXT NOT NULL,category TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS service_revisions (service_id TEXT NOT NULL,revision INTEGER NOT NULL,content TEXT NOT NULL,signed_at TEXT NOT NULL,PRIMARY KEY(service_id,revision));"); db.prepare('INSERT INTO services (id,builder,chain_id,token_id,category,status,revision,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,'0xb72335e083a7eed9731d24c48dbf07c4ef1f051a',97,content.tokenId,content.category,content.status,1,raw,'2026-11-01T00:00:00.000Z','2026-11-01T00:00:00.000Z'); db.prepare('INSERT INTO service_revisions (service_id,revision,content,signed_at) VALUES (?,?,?,?)').run(id,1,raw,'2026-11-01T00:00:00.000Z'); db.close();`, path, id, JSON.stringify(content)], { env: { ...process.env, NODE_OPTIONS: '' } });

  await alignBrowserClock(page);
  await installMockWallet(page, { address: BUYER, chainId: 97 });
  await mockChain(page, { chainId: 97, now: chainNowSeconds(), native: parseUnits('1', 18), tokens: { [TESTNET_ESCROW.paymentToken]: { balance: parseUnits('100', 18), decimals: 18, symbol: 'U' } }, jobCounter: 1000n, disputeWindow: 900 });
  await page.goto(`/services/${id}`);
  await expect(page.getByRole('heading', { name: content.title })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your inputs and specific instructions' }).fill(`Check ${BUYER} and calculate the repay to restore 1.5.`);
  await page.getByRole('button', { name: 'Review brief' }).click();
  await expect(page.getByRole('textbox', { name: 'Brief for agent' })).toHaveValue(/Venus position review/);
  await page.getByRole('link', { name: 'Continue to quote and hire' }).click();
  await expect(page.getByRole('heading', { name: `Hire ${TEST_AGENT.name}` })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your brief' })).toHaveValue(/Check 0x89D29/);
  await page.getByRole('button', { name: 'Check the request' }).click();
  await page.getByRole('button', { name: 'Confirm this request' }).click();
  await expect(page.getByText(/The agent signed 0\.1 \$U for this exact task/)).toBeVisible();
  expect((await walletCalls(page)).filter((call) => SIGNING_METHODS.includes(call.method))).toEqual([]);
});

test('claimed builder tabs switch without reloading the storefront', async ({ page }) => {
  const dataDir = process.env.POKTER_TEST_DATA_DIR!;
  const profile = { ...EMPTY_PROFILE, handle: 'tabs-fixture', displayName: 'Tabs fixture', published: true, showBuilding: true, usage: 'build', agents: [] };
  execFileSync(process.execPath, ['-e', `const {DatabaseSync}=require('node:sqlite');const [path,raw]=process.argv.slice(1);const db=new DatabaseSync(path);db.exec('CREATE TABLE IF NOT EXISTS profiles (wallet TEXT PRIMARY KEY,handle TEXT,content TEXT NOT NULL,signed_at TEXT NOT NULL,signature TEXT NOT NULL)');db.prepare('INSERT INTO profiles (wallet,handle,content,signed_at,signature) VALUES (?,?,?,?,?)').run('0x00000000000000000000000000000000000000bb','tabs-fixture',raw,'2026-11-01T00:00:00.000Z','fixture-only');db.close();`, join(dataDir, 'profiles.db'), JSON.stringify(profile)], { env: { ...process.env, NODE_OPTIONS: '' } });
  await page.goto('/builders/tabs-fixture');
  const profileLoad = await page.evaluate(() => performance.timeOrigin);
  const profileTabs = page.getByRole('navigation', { name: 'Building tabs' });
  for (const name of ['Services', 'Evidence', 'Work', 'Reviews', 'Agents']) {
    await profileTabs.getByRole('link', { name }).click();
    await expect(profileTabs.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(profileLoad);
  }
});

test('a builder profile keeps its target through composition and reaches the builder inbox', async ({ page }) => {
  test.setTimeout(180_000);
  const dataDir = process.env.POKTER_TEST_DATA_DIR!;
  const builder = '0xb72335e083a7eed9731d24c48dbf07c4ef1f051a';
  const profile = { ...EMPTY_PROFILE, handle: 'risk-fixture', displayName: 'Risk fixture', published: true, showBuilding: true, usage: 'build', agents: [] };
  execFileSync(process.execPath, ['-e', `const {DatabaseSync}=require('node:sqlite');const [path,raw]=process.argv.slice(1);const db=new DatabaseSync(path);db.exec('CREATE TABLE IF NOT EXISTS profiles (wallet TEXT PRIMARY KEY,handle TEXT,content TEXT NOT NULL,signed_at TEXT NOT NULL,signature TEXT NOT NULL)');db.prepare('INSERT INTO profiles (wallet,handle,content,signed_at,signature) VALUES (?,?,?,?,?)').run('0xb72335e083a7eed9731d24c48dbf07c4ef1f051a','risk-fixture',raw,'2026-11-01T00:00:00.000Z','fixture-only');db.close();`, join(dataDir, 'profiles.db'), JSON.stringify(profile)], { env: { ...process.env, NODE_OPTIONS: '' } });
  const buyer = privateKeyToAccount(`0x${'42'.repeat(32)}`);
  await installMockWallet(page, { address: buyer.address, chainId: 97, testSign: async (message) => buyer.signMessage({ message: isHex(message) ? { raw: message as Hex } : message }) });
  await page.goto('/builders/risk-fixture');
  await expect(page.getByRole('link', { name: TEST_AGENT.name }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Request custom work' }).click();
  await expect(page).toHaveURL(new RegExp(`builder=${builder}`, 'i'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Request work from Risk fixture' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Task title' }).fill('Check my Venus position');
  await page.getByRole('textbox', { name: 'What do you need?' }).fill('Review a Venus position and explain its health factor.');
  await page.getByRole('textbox', { name: 'Done when' }).fill('Report the health factor and a repay amount.');
  await page.getByRole('textbox', { name: 'Your proposed budget' }).fill('0.1');
  await page.getByRole('button', { name: 'Preview request' }).click();
  await expect(page.getByText(/Only this builder can propose through Pokter/)).toBeVisible();
  await page.getByRole('button', { name: 'Publish request' }).click();
  await expect(page).toHaveURL(/\/requests\/[0-9a-f-]{36}/);
  const requestId = new URL(page.url()).pathname.split('/').at(-1);
  const saved = await (await page.request.get(`/api/briefs?target=${builder}`)).json() as { briefs: Array<{ id: string; targetBuilder: string }> };
  expect(saved.briefs.some((brief) => brief.id === requestId && brief.targetBuilder.toLowerCase() === builder)).toBe(true);
  await page.goto('/requests');
  const requestCard = page.getByRole('link', { name: /Check my Venus position/ });
  await expect(requestCard).toBeVisible();
  await expect(page.locator('ul.grid').filter({ has: requestCard })).toBeVisible();
  await page.screenshot({ path: '/tmp/pokter-requests-grid.png', fullPage: true });
  const builderPage = await page.context().newPage();
  await installMockWallet(builderPage, { address: builder as `0x${string}`, chainId: 97 });
  await builderPage.goto('/build');
  await expect(builderPage.getByRole('heading', { name: 'Requests for your builder wallet' })).toBeVisible();
  await builderPage.getByRole('link', { name: /Check my Venus position/ }).first().click();
  await expect(builderPage.getByRole('button', { name: 'Make a proposal' })).toBeVisible();
  await builderPage.goto('/builders/risk-fixture?view=building&tab=services');
  await builderPage.getByRole('navigation', { name: 'Building tabs' }).getByRole('link', { name: 'Services' }).click();
  await builderPage.getByRole('link', { name: 'Publish a service' }).click();
  await expect(builderPage).toHaveURL(new RegExp(`/build/services/new\\?builder=${builder}`, 'i'));
  await builderPage.close();
  expect((await walletCalls(page)).filter((call) => ['eth_sendTransaction', 'wallet_sendCalls'].includes(call.method))).toEqual([]);
});
