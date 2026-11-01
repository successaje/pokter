import { expect, type Locator, type Page } from '@playwright/test';
import { parseUnits } from 'viem';

import { mockChain, type MockChainState } from './mock-chain';
import { installMockWallet, type MockWallet } from './mock-wallet';
import { TEST_AGENT } from './test-agent.mjs';

/*
 * The hire page walked to its last step, where the buyer funds the escrow.
 *
 * Every step runs for real against the test server: the brief is compiled
 * by /api/hire/compile, and the price is the one /api/hire/quote returns
 * after it has asked the agent and checked the signature against the
 * agent's registered wallet. The agent is Brinkwatch's testnet registration
 * answering with the test key (support/test-agent.mjs); the server's network
 * is its fixtures (support/server-network.mjs). Only the browser's side is
 * stood in for: a wallet that refuses to sign (support/mock-wallet.ts), a
 * chain that answers balance and escrow reads (support/mock-chain.ts), and
 * nothing else outside this machine reachable at all.
 */

/** The ERC-8183 deployment on BNB testnet, as `correctedErc8183Addresses(97)` names it. */
export const TESTNET_ESCROW = {
  commerce: '0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE',
  policy: '0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA',
  paymentToken: '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565',
} as const;

/** A buyer with no key behind it: the mock wallet answers with this address and signs nothing. */
export const BUYER = '0x89D29fbf9F3B6E727530231438f80d556ff2d905' as const;

export interface HireOptions {
  /** The brief written on the first step. Default: a Venus health check of the buyer's own wallet, which Brinkwatch accepts. */
  brief?: string;
  /** Over the default wallet: the buyer, on testnet. */
  wallet?: Partial<MockWallet>;
  /** Over the default chain: a buyer holding 100 $U and 1 tBNB, a 15-minute dispute window. */
  chain?: Partial<MockChainState>;
  /** Tick "I understand, and want to hire anyway" when the review step shows Pokter's warnings about the agent. Default true. */
  acceptWarnings?: boolean;
  /** Tick "I’ve checked the amount, network and recipient" on the funding step. Default true. */
  confirm?: boolean;
}

export interface ReviewStep {
  /** The review step's "Continue to payment" button, not pressed. */
  continueToPayment: Locator;
  /** The price the agent signed, as the review step states it ("The agent signed 0.1 $U for this exact task. …"). */
  signedPrice: string;
  /** The brief the quote was signed for. */
  brief: string;
  /** Every JSON-RPC method the page asked the chain, in order. */
  chainAsked: () => string[];
  /** Hosts outside this machine the browser tried to reach, and was stopped from. */
  blockedHosts: () => string[];
}

export interface FundingGate extends ReviewStep {
  /** The funding step's "I’ve checked the amount, network and recipient" checkbox. */
  confirmation: Locator;
  /** The "Fund escrow" button, not pressed. */
  fund: Locator;
}

/**
 * Open the hire page for the test agent and walk Describe the job and
 * Request to Review the terms, where the agent's signed price is shown.
 * Stops there without continuing, for a test about what blocks payment.
 */
export async function reachReviewStep(page: Page, options: HireOptions = {}): Promise<ReviewStep> {
  const brief = options.brief ?? `Venus health factor for ${BUYER} and the repay that restores 1.5`;

  /*
   * The browser reaches nothing but the test server. Registered first, so
   * the chain below, registered later, answers the nodes it models.
   */
  const blocked = new Set<string>();
  await page.route(
    (url) => url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
    (route) => {
      blocked.add(new URL(route.request().url()).host);
      return route.abort('blockedbyclient');
    },
  );
  await installMockWallet(page, { address: BUYER, chainId: TEST_AGENT.chainId, ...options.wallet });
  const chain = await mockChain(page, {
    chainId: TEST_AGENT.chainId,
    now: Math.floor(Date.now() / 1000),
    native: parseUnits('1', 18),
    tokens: { [TESTNET_ESCROW.paymentToken]: { balance: parseUnits('100', 18), decimals: 18, symbol: 'U' } },
    jobCounter: 1000n,
    disputeWindow: 15 * 60,
    ...options.chain,
  });

  await page.goto(`/hire/${TEST_AGENT.chainId}/${TEST_AGENT.tokenId}`);

  // Describe the job.
  await expect(page.getByRole('heading', { name: `Hire ${TEST_AGENT.name}` })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your brief' }).fill(brief);
  await page.getByRole('button', { name: 'Check the request' }).click();

  // Check the request: what the agent will be asked, compiled by the server.
  await expect(page.getByRole('heading', { name: 'Check the request' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm this request' }).click();

  // Review the terms: the price the agent signed for this exact brief.
  await expect(page.getByRole('heading', { name: 'Review the terms' })).toBeVisible();
  const signed = page.getByText(/^The agent signed .+ for this exact task\./);
  await expect(signed).toBeVisible();
  /* Pokter's warnings about the agent, when it has any, are read and accepted as a buyer would. */
  const acceptRisk = page.getByRole('checkbox', { name: 'I understand, and want to hire anyway' });
  if (options.acceptWarnings !== false && (await acceptRisk.count()) > 0) await acceptRisk.check();

  return {
    continueToPayment: page.getByRole('button', { name: 'Continue to payment' }),
    signedPrice: ((await signed.textContent()) ?? '').trim(),
    brief,
    chainAsked: chain.asked,
    blockedHosts: () => [...blocked].sort(),
  };
}

/**
 * Walk the hire page for the test agent through Describe the job, Request
 * and Terms to Fund, and return the "Fund escrow" button without pressing it.
 *
 * It asserts only what standing on the funding step needs: each step's
 * heading and a signed price on the review step. Whether the button is
 * enabled is the caller's to assert, so a test of a blocked gate uses this
 * as it is.
 */
export async function reachFundingGate(page: Page, options: HireOptions = {}): Promise<FundingGate> {
  const review = await reachReviewStep(page, options);
  await review.continueToPayment.click();

  // Fund the escrow.
  await expect(page.getByRole('heading', { name: 'Fund the escrow' })).toBeVisible();
  const confirmation = page.getByRole('checkbox', { name: 'I’ve checked the amount, network and recipient' });
  if (options.confirm !== false) await confirmation.check();
  return { ...review, confirmation, fund: page.getByRole('button', { name: /^Fund escrow/ }) };
}
