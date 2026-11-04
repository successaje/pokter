import { expect, test } from '@playwright/test';
import { installMockWallet, SIGNING_METHODS, walletCalls } from './support/mock-wallet';

const unclaimed = '0x00000000000000000000000000000000000000bb' as const;

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
