import type { Classification } from '@/lib/agents/categories';

/**
 * A concrete brief for asking an agent its price, by category.
 *
 * The sweep asks every agent the same generic question ("quote your
 * standard deliverable"), and most answer it. Some, correctly, will not
 * price work they have not been shown: Brain on BNB's grid planner
 * declined with "grid_plan needs `token`: the token or pool address
 * (0x…)", and was listed as an agent a hire would fail on, a refusal
 * that was Pokter's question rather than the agent's fault.
 *
 * So an agent that declines the generic enquiry is asked once more with
 * a brief a buyer in its category would write, naming real, long-lived
 * BNB Chain addresses: CAKE and BSC-USD tokens, a Venus borrower, a wallet
 * holding PancakeSwap v3 positions. These are read-only questions, and
 * the resulting quote is a price for that sample job; a hire still
 * negotiates afresh over the buyer's own brief.
 */
const CAKE = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';
const BSC_USD = '0x55d398326f99059fF775485246999027B3197955';
const VENUS_BORROWER = '0x0aEe98f6317ad64472330CA09af6c076BeE99aB7';
const V3_HOLDER = '0xab7ed4d30757baa7d3d65d9e0aaba2c827a69e9c';

const SAMPLES: Record<Exclude<Classification, 'unclassified'>, string> = {
  'grid-trading': `Grid plan for CAKE (token ${CAKE}) with 500 USDT, range 1.8 to 2.6, 8 grids, on PancakeSwap.`,
  yield: `I hold 1000 USDT (token ${BSC_USD}) on BNB Chain and can leave it for 30 days. Where is the best net yield?`,
  rebalancing: `Range check for the PancakeSwap v3 positions held by ${V3_HOLDER}: which are in range, and what should be re-centred?`,
  'health-factor': `What is the Venus health factor of ${VENUS_BORROWER}, and is it at risk of liquidation?`,
  'token-safety': `Check the BNB Chain token ${CAKE} before a buy: is it safe to trade, and why?`,
};

/** The sample-job brief for a category, or null when the agent has none. */
export function sampleBrief(category: Classification): string | null {
  return category === 'unclassified' ? null : SAMPLES[category];
}
