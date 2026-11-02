import type { Category } from '@/lib/agents/categories';

/**
 * Each category named for the outcome a person wants, with the plain
 * question it answers and the search it starts. Named for what arrives,
 * not for what a buyer wishes would happen: these agents report and
 * analyse; none of them moves funds on a buyer's behalf through Pokter.
 */
export const OUTCOMES: Record<Category, { verb: string; detail: string; query: string }> = {
  'health-factor': {
    verb: 'Check a loan’s liquidation risk',
    detail: 'How close a lending position sits to liquidation, and from whose numbers.',
    query: 'Check the liquidation risk of my lending position',
  },
  yield: {
    verb: 'Compare yield, net of costs',
    detail: 'Routes for idle capital, compared after gas and impermanent loss.',
    query: 'Compare yield opportunities net of gas',
  },
  rebalancing: {
    verb: 'Keep a portfolio on target',
    detail: 'How far weights have drifted and what restoring them would take.',
    query: 'Check how far my portfolio has drifted from target',
  },
  'grid-trading': {
    verb: 'Check a trading range still fits',
    detail: 'Whether a buy-low, sell-high range still matches how the market moves.',
    query: 'Review whether my grid trading range still fits the market',
  },
  'token-safety': {
    verb: 'Screen a token before buying',
    detail: 'What a token contract can do to a holder: taxes, blacklists, mint rights.',
    query: 'Check if a token is safe to buy',
  },
  research: {
    verb: 'Research a question',
    detail: 'A sourced report that lets you inspect the claims and dates.',
    query: 'Research a BNB Chain topic with cited sources',
  },
  trading: {
    verb: 'Review a trade plan',
    detail: 'An entry, exit, fees and the conditions that invalidate a trade.',
    query: 'Review a spot trading plan and its risks',
  },
  content: {
    verb: 'Create content from a brief',
    detail: 'Written content that follows your audience, format and source requirements.',
    query: 'Write a sourced BNB Chain explainer',
  },
};
