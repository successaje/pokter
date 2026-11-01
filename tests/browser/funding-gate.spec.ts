import { expect, test } from '@playwright/test';

import { BUYER, reachFundingGate, TESTNET_ESCROW } from './support/funding-gate';
import { SIGNING_METHODS, walletCalls } from './support/mock-wallet';
import { TEST_AGENT } from './support/test-agent.mjs';

/*
 * The hire flow up to the one step that moves money, on the real hire
 * routes: the brief compiled, the request checked, and a price the agent
 * signed and the server verified against the agent's registered wallet
 * before the page would show it. The wallet is a mock that refuses to sign,
 * so funding can be pressed and nothing can be sent.
 *
 * Run on the development server and again on a production build (@production).
 */

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const SENDING = ['eth_sendTransaction', 'wallet_sendCalls'];

for (const tag of ['', '@production ']) {
  test.describe(`${tag}the funding gate`, () => {
    // The first visit compiles the hire page and its routes on a development server.
    test.setTimeout(180_000);

    test('a signed quote opens Fund escrow at the signed price, before anything is signed', async ({ page }) => {
      const gate = await reachFundingGate(page);

      // The price as the review step stated it: signed by the agent for this exact brief.
      expect(gate.signedPrice).toContain('The agent signed 0.1 $U for this exact task.');

      // The funding step pays that price, into the testnet escrow, for the agent's registered wallet.
      await expect(page.getByText(/^Pay .+ into the escrow contract/)).toHaveText(
        `Pay 0.1 $U into the escrow contract ${short(TESTNET_ESCROW.commerce)} on BNB Testnet, for one job delivered by ${short(TEST_AGENT.address)}.`,
      );
      await expect(gate.fund).toBeVisible();
      await expect(gate.fund).toHaveText('Fund escrow · 0.1 $U');
      await expect(gate.fund).toBeEnabled();

      // Getting here asked the wallet for nothing it would have to sign.
      expect((await walletCalls(page)).filter((call) => SIGNING_METHODS.includes(call.method))).toEqual([]);
    });

    test('pressing Fund escrow asks the wallet, and a refusal sends nothing', async ({ page }) => {
      const gate = await reachFundingGate(page);
      await expect(gate.fund).toBeEnabled();
      await gate.fund.click();

      // The page says the wallet declined and that nothing moved, and stays on the funding step.
      await expect(page.getByText('You declined in the wallet')).toBeVisible();
      await expect(page.getByText('Nothing was sent and no funds moved.')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Fund the escrow' })).toBeVisible();

      // The press reached the wallet: a transaction to the escrow, from the buyer...
      const calls = await walletCalls(page);
      const sends = calls.filter((call) => SENDING.includes(call.method));
      expect(sends.length).toBeGreaterThan(0);
      const [sent] = (sends[0].params ?? []) as Array<{ from?: string; to?: string; calls?: Array<{ to?: string }> }>;
      expect((sent?.to ?? sent?.calls?.[0]?.to)?.toLowerCase()).toBe(TESTNET_ESCROW.commerce.toLowerCase());
      expect(sent?.from?.toLowerCase()).toBe(BUYER.toLowerCase());
      // ...which refused every request to sign or send, so nothing was sent.
      expect(calls.filter((call) => SIGNING_METHODS.includes(call.method) && call.outcome !== 'refused')).toEqual([]);
      // Nor did anything reach the chain another way.
      expect(gate.chainAsked()).not.toContain('eth_sendRawTransaction');
    });
  });
}
