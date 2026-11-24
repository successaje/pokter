import { expect, test } from '@playwright/test';

import { alignBrowserClock, chainNowSeconds } from './support/clock';
import { mockChain } from './support/mock-chain';
import { installMockWallet } from './support/mock-wallet';

/*
 * A hire this browser saved under another job's number, as a 0.05 hire of
 * BORT Yield Weaver was saved as testnet #1382, which is another buyer's
 * settled 1 $U job for another agent. The row showed "Settled" and a
 * seventeen-digit amount in base units. It now says the number is wrong,
 * and keeps the amount short.
 */

const BUYER = '0x89D29fbf9F3B6E727530231438f80d556ff2d905' as const;
const AGENT_WALLET = '0x60eF148485C2a5119fa52CA13c52E9fd98F28e87' as const;
const OTHER_AGENT = '0xdB4E54b0De9dee384a2B4bc5597C40E90C1E53c9' as const;
const OTHER_BUYER = '0x1cC9c47969DF5703952EC5048dC71F69aDF89A4a' as const;

test('a hire saved under another job’s number says so, instead of showing that job’s status', async ({ page }) => {
  test.setTimeout(120_000);
  await alignBrowserClock(page);
  await installMockWallet(page, { address: BUYER, chainId: 97 });
  await page.route((url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1', (route) => route.abort('blockedbyclient'));
  const now = chainNowSeconds();
  await mockChain(page, {
    chainId: 97,
    now,
    jobs: { '991382': { client: OTHER_BUYER, provider: OTHER_AGENT, status: 'COMPLETED', expiredAt: now - 86_400, budget: 10n ** 18n } },
  });
  const saved = {
    id: 'saved-wrong-number',
    jobId: '991382',
    chainId: 97,
    isTestnet: true,
    agentChainId: 56,
    agentTokenId: '153698',
    agentName: 'Saved number test agent',
    provider: AGENT_WALLET,
    task: 'Analyse the available BNB Chain yield opportunities.',
    budgetRaw: '50000000000000000',
    paymentToken: null,
    expiredAt: new Date((now - 3_600) * 1000).toISOString(),
    hiredAt: new Date((now - 7_200) * 1000).toISOString(),
    hireTxHash: null,
    status: 'COMPLETED',
    statusCheckedAt: new Date((now - 3_600) * 1000).toISOString(),
    deliverableUrl: null,
    settleTxHash: null,
  };
  /* Saved once, as a browser that hired would have it; later loads keep what the page wrote back. */
  await page.addInitScript(({ buyer, job }) => {
    if (!localStorage.getItem('pokter.jobs.v1')) localStorage.setItem('pokter.jobs.v1', JSON.stringify([{ walletAddress: buyer, job }]));
  }, { buyer: BUYER, job: saved });

  await page.goto('/workspace/jobs');
  const row = page.getByRole('link', { name: /Saved number test agent/ });
  await expect(row).toContainText('Wrong job number');
  await expect(row).toContainText('Saved under another job’s number');
  await expect(row).toContainText('Currency unknown');
  await expect(row).not.toContainText('Settled');
  await expect(row).not.toContainText('base units');

  /* Written back to this browser's record, so it holds after a reload without asking the chain to decide again. */
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pokter.jobs.v1') ?? '[]')) as Array<{ job: { numberMismatch?: { provider: string } | null } }>;
  expect(stored[0]?.job.numberMismatch?.provider).toBe(OTHER_AGENT);
});
