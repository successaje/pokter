import type { ClientPool } from './pool';

/**
 * What hiring an agent would cost an LP, and what it must earn to be worth it.
 *
 * The asymmetry here is deliberate and is the whole point. The **cost** of
 * running an agent is computable from live pool state: the fee tier is
 * published, the price impact follows from the liquidity actually sitting at
 * the current tick, and the agent's own price is in its service listing. The
 * **benefit** is not computable — no agent publishes realised returns, and
 * nothing on-chain attributes fee capture to a rebalance decision.
 *
 * So this does not forecast profit. It computes the break-even: the improvement
 * in fee capture the agent has to deliver before an LP is better off hiring it.
 * That is a number an LP can hold the agent to, rather than a projection they
 * have to believe.
 */

/** Q96, the fixed-point scale PancakeSwap V3 stores its sqrt price in. */
const Q96 = 2 ** 96;

export interface CostInput {
  pool: ClientPool;
  /** Position size in USD. */
  positionUsd: number;
  /** How many times a month the agent would rebalance. */
  rebalancesPerMonth: number;
  /** What the agent charges per job, in $U. */
  agentFeeU: number;
  /** Share of the position swapped on each rebalance, 0–1. */
  turnoverPerRebalance: number;
}

export interface CostBreakdown {
  /** Pool fee paid on the swapped notional, per month, in USD. */
  swapFeesUsd: number;
  /** Price impact against real liquidity, per month, in USD. */
  priceImpactUsd: number;
  /** What the agent charges per month, in $U. */
  agentFeesU: number;
  /** Gas, per month, in USD. */
  gasUsd: number;
  /** Everything except the agent's own fee, which is denominated in $U. */
  onchainCostUsd: number;
  /** Price impact of a single rebalance, as a fraction. */
  impactPerRebalance: number;
  /**
   * Annualised fee-capture improvement the agent must deliver to break even,
   * as a fraction of the position.
   */
  breakEvenApr: number;
  /** True when the trade is large enough that the estimate understates it. */
  beyondTickRange: boolean;
}

/**
 * Price impact of swapping `amountUsd` against the liquidity at the current
 * tick.
 *
 * Within a single tick range V3 liquidity is constant, so the post-trade price
 * follows in closed form. Which closed form depends on which side is being sold:
 * selling token0 pushes `sqrtP` down, selling token1 pushes it up, and using
 * the wrong one gives a plausible number with the wrong sign of error.
 *
 * The trade size must be converted into the quote token's own raw units first.
 * Comparing a dollar figure directly against an 18-decimal reserve makes every
 * realistic trade look like zero impact.
 *
 * Exact while the swap stays inside the current range, and **optimistic** once
 * it does not, because crossing a tick usually moves into thinner liquidity —
 * flagged rather than quoted silently.
 */
function priceImpact(
  pool: ClientPool,
  amountUsd: number,
): { impact: number; beyondRange: boolean } {
  const sqrtP = Number(pool.sqrtPriceX96) / Q96;
  const liquidity = Number(pool.liquidity);

  if (
    !Number.isFinite(sqrtP) ||
    sqrtP <= 0 ||
    liquidity <= 0 ||
    pool.quoteUsdPrice <= 0
  ) {
    return { impact: 0, beyondRange: true };
  }

  // USD → quote tokens → the raw integer units the pool actually accounts in.
  const quoteTokens = amountUsd / pool.quoteUsdPrice;
  const dx = quoteTokens * 10 ** pool.quoteDecimals;

  // Virtual reserve of the side being sold.
  const reserve = pool.quoteIsToken0 ? liquidity / sqrtP : liquidity * sqrtP;

  const sqrtPNext = pool.quoteIsToken0
    ? (liquidity * sqrtP) / (liquidity + dx * sqrtP)
    : sqrtP + dx / liquidity;

  const ratio = (sqrtPNext / sqrtP) ** 2;
  const impact = Math.abs(1 - ratio);

  // Past roughly a tenth of the active reserve, constant liquidity stops
  // holding well enough to quote.
  return { impact, beyondRange: dx > reserve * 0.1 };
}

/** Gas per rebalance on BNB Chain, in USD. Deliberately generous. */
const GAS_PER_REBALANCE_USD = 0.35;

export function computeCost(input: CostInput): CostBreakdown {
  const { pool, positionUsd, rebalancesPerMonth, agentFeeU, turnoverPerRebalance } =
    input;

  const notionalPerRebalance = positionUsd * turnoverPerRebalance;

  const feeRate = pool.feeTier / 1_000_000;
  const swapFeesUsd = notionalPerRebalance * feeRate * rebalancesPerMonth;

  const { impact, beyondRange } = priceImpact(pool, notionalPerRebalance);
  const priceImpactUsd = notionalPerRebalance * impact * rebalancesPerMonth;

  const gasUsd = GAS_PER_REBALANCE_USD * rebalancesPerMonth;
  const onchainCostUsd = swapFeesUsd + priceImpactUsd + gasUsd;

  const agentFeesU = agentFeeU * rebalancesPerMonth;

  // Annualised, and expressed against the position so an LP can compare it to
  // the APR the pool is already paying them.
  const breakEvenApr =
    positionUsd > 0 ? ((onchainCostUsd * 12) / positionUsd) : 0;

  return {
    swapFeesUsd,
    priceImpactUsd,
    agentFeesU,
    gasUsd,
    onchainCostUsd,
    impactPerRebalance: impact,
    breakEvenApr,
    beyondTickRange: beyondRange,
  };
}
