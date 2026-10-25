/**
 * The runtime choices a category offers, in one place.
 *
 * These feed the build prompt, and the prompt is generated on two pages:
 * the guided Configure step and the standalone prompt builder. They used
 * to derive their inputs separately — one from a live draft, the other
 * from three form fields with the protocol hardcoded — so the same idea
 * produced two different prompts, and only one of them was ever read.
 *
 * Lives in `lib` rather than beside the hook that first held it so that
 * both pages and the tests can reach it without importing a client
 * component.
 */
export const RUNTIME_OPTIONS: Record<string, { target: string[]; policy: string[]; output: string[] }> = {
  'health-factor': { target: ['Venus', 'Lista'], policy: ['Conservative', 'Balanced', 'Custom thresholds'], output: ['Risk report', 'Stress analysis', 'Action plan'] },
  yield: { target: ['Stablecoins', 'BNB liquid staking', 'All supported assets'], policy: ['Capital preservation', 'Balanced', 'Opportunity seeking'], output: ['Opportunity comparison', 'Allocation research', 'Risk report'] },
  rebalancing: { target: ['Wallet portfolio', 'Treasury', 'Liquidity positions'], policy: ['Drift threshold', 'Scheduled review', 'Custom mandate'], output: ['Rebalancing plan', 'Exposure report', 'Proposed trade list'] },
  'grid-trading': { target: ['BNB / USDT', 'BTCB / USDT', 'Custom pair'], policy: ['Wide conservative grid', 'Balanced grid', 'Custom constraints'], output: ['Grid parameters', 'Scenario analysis', 'Risk-bounded plan'] },
  'token-safety': { target: ['BEP-20 tokens', 'New launches', 'A watchlist'], policy: ['Flag anything uncertain', 'Balanced', 'Only hard failures'], output: ['Safety report', 'Holder risk summary', 'Pass / fail screen'] },
};
