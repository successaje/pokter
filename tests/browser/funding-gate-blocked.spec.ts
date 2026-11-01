import { expect, test, type Page } from '@playwright/test';

import { BUYER, reachFundingGate } from './support/funding-gate';
import { SIGNING_METHODS, walletCalls } from './support/mock-wallet';

/*
 * The funding gate itself, reached for real: the brief compiled and the
 * price signed by the test agent and checked by the server, as in
 * funding-gate.spec.ts. Here the browser also holds a payment record it
 * cannot read for the same wallet, and the gate must stay shut: the button
 * disabled, the reason on screen, and nothing asked of the wallet.
 */

const KEY = `pokter:funding-attempt:97:${BUYER.toLowerCase()}`;

async function seed(page: Page, record: string) {
  await page.addInitScript(
    ({ key, record }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(key, record);
    },
    { key: KEY, record },
  );
}

const notice = (page: Page) => page.getByRole('status').filter({ hasText: 'An earlier payment record on this browser cannot be read' });

test.describe('the funding gate with an unreadable payment record', () => {
  test.setTimeout(180_000);

  for (const [what, record] of [
    ['not readable data', '{"attemptId":"earlier","wallet":"0x89D2'],
    ['a record that does not say its last wallet request', JSON.stringify({ attemptId: 'earlier', ownerTab: 'gone', wallet: BUYER, chainId: 97, txHashes: [], state: 'pending' })],
  ] as const) {
    test(`stays shut for ${what}, and the record is left as it was`, async ({ page }) => {
      await seed(page, record);
      const gate = await reachFundingGate(page);
      await expect(notice(page)).toBeVisible();
      await expect(gate.confirmation).toBeChecked();
      await expect(gate.fund).toBeDisabled();
      expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBe(record);
      expect((await walletCalls(page)).filter((c) => SIGNING_METHODS.includes(c.method))).toEqual([]);
    });
  }
});
