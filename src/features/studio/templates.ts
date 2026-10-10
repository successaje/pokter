import type { DraftFields } from '@/lib/builder/drafts';

/**
 * Starting points for a new agent. Every one is advisory by design: it
 * reads, analyses and reports. None moves funds, because Pokter does not
 * grant agents authority over a buyer's wallet.
 */
export const TEMPLATES: Array<{ id: string; title: string; summary: string; returns: string; draft: DraftFields }> = [
  {
    id: 'health-factor-monitor',
    title: 'Health-factor monitor',
    summary: 'Explains lending risk and flags positions approaching liquidation.',
    returns: 'A risk report per position, with the data sources it used.',
    draft: {
      name: 'Position Guardian',
      description: 'Checks supported BNB Chain lending positions, explains health-factor changes, and returns a read-only risk report without moving funds or promising liquidation protection.',
      category: 'health-factor',
      protocol: 'a2a',
      endpoint: '',
      image: '',
      repository: '',
    },
  },
  {
    id: 'yield-researcher',
    title: 'Yield researcher',
    summary: 'Compares opportunities net of costs, never presenting APY as a guarantee.',
    returns: 'A ranked comparison with fees, liquidity, lockups and assumptions.',
    draft: {
      name: 'Treasury Sentinel',
      description: 'Monitors a BNB Chain treasury, compares risk-adjusted stablecoin yields, and returns a read-only allocation plan with source data, assumptions, and explicit loss limits.',
      category: 'yield',
      protocol: 'a2a',
      endpoint: '',
      image: '',
      repository: '',
    },
  },
  {
    id: 'rebalancing-adviser',
    title: 'Rebalancing adviser',
    summary: 'Produces an allocation plan that stays advisory and user-approved.',
    returns: 'Proposed trades with amounts, drift, and the execution risks.',
    draft: {
      name: 'Allocation Guide',
      description: 'Compares a portfolio with user-defined allocation targets and returns a read-only rebalancing plan with proposed amounts, market assumptions, and explicit execution risks.',
      category: 'rebalancing',
      protocol: 'a2a',
      endpoint: '',
      image: '',
      repository: '',
    },
  },
  {
    id: 'grid-planner',
    title: 'Grid range planner',
    summary: 'Checks whether a grid strategy’s range still fits the market.',
    returns: 'Grid parameters with a volatility scenario and stated limits.',
    draft: {
      name: 'Grid Range Planner',
      description: 'Reviews a proposed BNB Chain grid-trading range against recent volatility and returns read-only grid parameters with scenarios, assumptions and the conditions under which the range fails.',
      category: 'grid-trading',
      protocol: 'a2a',
      endpoint: '',
      image: '',
      repository: '',
    },
  },
  {
    id: 'token-screener',
    title: 'Token safety screener',
    summary: 'Reports what a token contract can do to a holder before they buy.',
    returns: 'A pass, warn or fail screen with the contract functions behind it.',
    draft: {
      name: 'Token Screen',
      description: 'Inspects a BNB Chain token contract for sell taxes, blacklists, mint authority and ownership controls, and returns a read-only safety screen naming the functions it found and what it could not check.',
      category: 'token-safety',
      protocol: 'a2a',
      endpoint: '',
      image: '',
      repository: '',
    },
  },
  {
    id: 'treasury-reporter',
    title: 'Treasury reporter (MCP tool)',
    summary: 'Summarises balances, movements and exposure for a team or DAO.',
    returns: 'A sourced treasury summary separating observations from advice.',
    draft: {
      name: 'Treasury Reporter',
      description: 'Produces a sourced BNB Chain treasury summary covering balances, recent movements, protocol exposure, and material changes while clearly separating observations from recommendations.',
      category: 'rebalancing',
      protocol: 'mcp',
      endpoint: '',
      image: '',
      repository: '',
    },
  },
];
