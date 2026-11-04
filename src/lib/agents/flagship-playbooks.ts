import type { Category } from './categories';

export type FlagshipCategory = Extract<Category, 'grid-trading' | 'yield' | 'rebalancing' | 'health-factor'>;

export const FLAGSHIP_CATEGORY_ORDER: readonly FlagshipCategory[] = ['grid-trading', 'yield', 'rebalancing', 'health-factor'];

export interface FlagshipPlaybook {
  category: FlagshipCategory;
  headline: string;
  summary: string;
  askFor: readonly string[];
  sampleBrief: string;
  delivery: string;
  outcome: string;
  template: string;
}

/** Buyer terms and builder starting points for BNB Chain's four campaign categories. */
export const FLAGSHIP_PLAYBOOKS: Record<FlagshipCategory, FlagshipPlaybook> = {
  'grid-trading': {
    category: 'grid-trading',
    headline: 'Get a grid plan you can inspect',
    summary: 'Ask for levels, order sizes, fee assumptions and conditions that would make the range unsuitable. The agent advises; it does not place trades through Pokter.',
    askFor: ['Pair and available budget', 'Lower and upper price bounds, or permission to propose them', 'Number of grids and fee assumptions', 'A condition for rejecting the plan'],
    sampleBrief: 'Plan a read-only grid for BNB/USDT with a 1,000 USDT budget, a 550–650 USDT range and 8 grids. Include levels, order sizes, fees and a scenario where this range should not be used. State the market data time and sources. Do not execute trades.',
    delivery: 'A grid plan with levels, sizing, fees, assumptions and a clear rejection condition.',
    outcome: 'Whether the plan later made money or its orders filled is not measured from a plan alone.',
    template: 'grid-planner',
  },
  yield: {
    category: 'yield',
    headline: 'Compare yield after costs',
    summary: 'Ask the agent to compare routes for your amount and holding period. A quoted APR is an estimate, never a realised return.',
    askFor: ['Asset, amount and holding period', 'Current route and minimum improvement worth moving for', 'Gas, fees, lockups and loss risks', 'A source and read time for every rate'],
    sampleBrief: 'I hold 1,000 USDT for 30 days. Compare BNB Chain stablecoin yield routes after gas, fees and any lockup. Recommend a move only if the estimated net APR exceeds my current route by 0.5 percentage points. Show source, read time, assumptions and risks. Do not move funds.',
    delivery: 'A sourced comparison of gross and estimated net rates, costs, risks and the decision threshold.',
    outcome: 'The actual return after 30 days is not established by the estimate in the answer.',
    template: 'yield-researcher',
  },
  rebalancing: {
    category: 'rebalancing',
    headline: 'See the trade-offs before rebalancing',
    summary: 'Ask for current weights, target weights and a costed proposal. The answer is an advisory plan; it cannot rebalance a wallet through Pokter.',
    askFor: ['Wallet or positions to read', 'Target weights and allowed drift', 'Costs, slippage and minimum trade size', 'A reason to leave the position unchanged'],
    sampleBrief: 'Review my BNB Chain portfolio at [wallet address] against targets of 50% stablecoins and 50% BNB. Propose trades only if drift exceeds 5 percentage points. Show current weights, trade sizes, estimated costs, data block and risks. Do not execute transactions.',
    delivery: 'Current allocation, proposed targets, bounded trades, costs and the case for doing nothing.',
    outcome: 'A suggested allocation is not proof that the wallet later changed or outperformed.',
    template: 'rebalancing-adviser',
  },
  'health-factor': {
    category: 'health-factor',
    headline: 'Check a loan against the chain',
    summary: 'Ask for the position, its health factor and liquidation distance at a named block. Pokter can compare a report with Venus chain state when that data is available.',
    askFor: ['Wallet and lending market', 'Collateral and debt to inspect', 'Warning threshold or stress scenario', 'Data block, sources and assumptions'],
    sampleBrief: 'Read my Venus Core Pool position at [wallet address] on BNB Chain. Report collateral, debt, health factor and distance to liquidation at a named block. Show the data source and a stress scenario. Do not repay, withdraw or move funds.',
    delivery: 'A dated risk report with position figures, liquidation distance and limitations.',
    outcome: 'A correct snapshot is not proof the position stayed safe after the checked block.',
    template: 'health-factor-monitor',
  },
};

export function flagshipPlaybook(category: string | null): FlagshipPlaybook | null {
  return category && Object.hasOwn(FLAGSHIP_PLAYBOOKS, category)
    ? FLAGSHIP_PLAYBOOKS[category as FlagshipCategory]
    : null;
}
