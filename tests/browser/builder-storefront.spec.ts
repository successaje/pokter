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
  await expect(page.getByText('Registry-derived builder profile')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Request custom work' })).toHaveCount(0);
  await page.goto(`/workspace/requests/new?builder=${unclaimed}`);
  await expect(page.getByRole('heading', { name: 'This builder cannot receive a directed request yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview request' })).toHaveCount(0);
  expect((await walletCalls(page)).filter((call) => SIGNING_METHODS.includes(call.method))).toEqual([]);
});

test('service catalogue shows only published offers and preserves usable search navigation', async ({ page }) => {
  await page.goto('/services');
  await expect(page.getByRole('heading', { name: 'Services with a clear scope.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No published services here yet' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search' }).fill('risk');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/services\?q=risk/);
  await expect(page.getByRole('heading', { name: 'No published services here yet' })).toBeVisible();
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

test('a builder profile keeps its target through composition and reaches the builder inbox', async ({ page }) => {
  test.setTimeout(180_000);
  const dataDir = process.env.POKTER_TEST_DATA_DIR!;
  const builder = '0xb72335e083a7eed9731d24c48dbf07c4ef1f051a';
  const profile = { ...EMPTY_PROFILE, handle: 'risk-fixture', displayName: 'Risk fixture', published: true, showBuilding: true, usage: 'build', agents: ['97:2618'] };
  execFileSync(process.execPath, ['-e', `const {DatabaseSync}=require('node:sqlite');const [path,raw]=process.argv.slice(1);const db=new DatabaseSync(path);db.exec('CREATE TABLE IF NOT EXISTS profiles (wallet TEXT PRIMARY KEY,handle TEXT,content TEXT NOT NULL,signed_at TEXT NOT NULL,signature TEXT NOT NULL)');db.prepare('INSERT INTO profiles (wallet,handle,content,signed_at,signature) VALUES (?,?,?,?,?)').run('0xb72335e083a7eed9731d24c48dbf07c4ef1f051a','risk-fixture',raw,'2026-11-01T00:00:00.000Z','fixture-only');db.close();`, join(dataDir, 'profiles.db'), JSON.stringify(profile)], { env: { ...process.env, NODE_OPTIONS: '' } });
  const buyer = privateKeyToAccount(`0x${'42'.repeat(32)}`);
  await installMockWallet(page, { address: buyer.address, chainId: 97, testSign: async (message) => buyer.signMessage({ message: isHex(message) ? { raw: message as Hex } : message }) });
  await page.goto('/builders/risk-fixture');
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
  const builderPage = await page.context().newPage();
  await installMockWallet(builderPage, { address: builder as `0x${string}`, chainId: 97 });
  await builderPage.goto('/build');
  await expect(builderPage.getByRole('heading', { name: 'Requests for your builder wallet' })).toBeVisible();
  await builderPage.getByRole('link', { name: /Check my Venus position/ }).click();
  await expect(builderPage.getByRole('button', { name: 'Make a proposal' })).toBeVisible();
  await builderPage.close();
  expect((await walletCalls(page)).filter((call) => ['eth_sendTransaction', 'wallet_sendCalls'].includes(call.method))).toEqual([]);
});
