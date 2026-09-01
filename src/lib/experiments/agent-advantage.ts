/**
 * Measured results from the Agent Advantage experiments.
 *
 * Transcribed from real runs on 2026-09-01 against BNB Chain mainnet, with the
 * raw outputs kept verbatim. This module is the single source for both
 * docs/termix-agent-advantage.md and the /agent-advantage page, so the two
 * cannot drift apart.
 *
 * Nothing here is illustrative. If a figure is not reproducible by the scripts
 * in experiments/, it does not belong in this file.
 */

export type Winner = 'agent' | 'manual' | 'tie';

export interface Experiment {
  id: string;
  title: string;
  question: string;
  /** Which of the four marketplace categories this exercises. */
  category: string;
  /** The §36 category this satisfies, when it satisfies one. */
  requiredCategory?: string;
  agent: { ms: number; output: string; note: string };
  manual: { ms: number; output: string; note: string };
  quality: string;
  winner: Winner;
  verdict: string;
}

export const MEASURED_AT = '2026-09-01';

export const AGENT_UNDER_TEST = {
  name: 'HeyAnon ERC-8004 Venus agent',
  endpoint: 'https://erc8004.heyanon.ai/mcp/venus',
  agentIds: '#43129, #45381',
  availability: '14/14 probes answered, measured by Pokter',
};

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'supply-apr',
    title: 'Venus supply APR',
    question:
      'What is the current Venus supply APR for USDT, USDC and BTCB on BNB Chain?',
    category: 'Yield optimisation',
    agent: {
      ms: 2283,
      output: 'USDT: 2.83%, USDC: 2.15%, BTCB: 0.19%',
      note: 'One tool call.',
    },
    manual: {
      ms: 3230,
      output: 'vUSDT 2.84%, vUSDC 2.15%, vBTC 0.19%',
      note: 'Comptroller market scan, 55 markets, symbol resolution, annualisation.',
    },
    quality:
      'Equivalent. Two independent paths produced the same three figures to within rounding, which is what verifies the agent — not anything it claims about itself.',
    winner: 'agent',
    verdict: 'Same answer, far less setup, and it avoids the annualisation trap.',
  },
  {
    id: 'liquidation-risk',
    title: 'Liquidation risk on a live position',
    question:
      'Is 0x96145D06…8Bf1, a real Venus borrower carrying ~1.96M USDT of debt, close to liquidation?',
    category: 'Health-factor monitoring',
    agent: {
      ms: 2927,
      output: 'borrowLimit $1,738,691.15 · shortfall $0.00',
      note: 'One tool call.',
    },
    manual: {
      ms: 895,
      output: 'liquidity $1,736,364.45 · shortfall $0',
      note: 'A single Comptroller.getAccountLiquidity read.',
    },
    quality:
      'Same decision — no shortfall, not liquidatable — but the headroom differs by about $2,327 (0.13%). Likely different blocks with oracle prices moving between them; we did not confirm that and do not report it as confirmed.',
    winner: 'manual',
    verdict:
      'Where the primitive already exists and you know its name, wrapping it in an agent adds latency and nothing else. Manual won by 3.3×.',
  },
  {
    id: 'cross-chain-borrow',
    title: 'Borrow cost across chains',
    question:
      'What does it cost to borrow USDT and USDC on Venus, on BNB Chain versus Ethereum, to price the borrow leg of a carry trade?',
    category: 'Grid / trading',
    requiredCategory: 'Trading',
    agent: {
      ms: 2464,
      output:
        'BSC — USDT 4.54%, USDC 3.95% · Ethereum — USDT 3.92%, USDC 7.65%',
      note: 'Two chains, four markets, one call.',
    },
    manual: {
      ms: 2447,
      output: 'BSC — USDT 4.54%, USDC 3.95%',
      note: 'One chain only. Ethereum needs a second RPC and a second market scan.',
    },
    quality:
      'Identical where they overlap; the agent covers strictly more. The answer is only interesting because it spans chains — USDT is cheaper to borrow on Ethereum, while USDC is nearly twice as expensive.',
    winner: 'agent',
    verdict: 'Greater coverage for the same wall-clock budget.',
  },
];

/** The trap the manual path sets, measured rather than asserted. */
export const ANNUALISATION_TRAP = {
  measuredBlockSeconds: 0.45,
  measuredBlocksPerYear: 70_080_000,
  legacyBlocksPerYear: 10_512_000,
  correctApr: '2.84%',
  legacyApr: '0.43%',
  factor: '6.67×',
  agentAnswer: '2.83%',
};
