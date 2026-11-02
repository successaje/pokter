import { check, close, numAt, strAt, type Obj, type PlanCheck } from './plan-check-kit';

/** A proposed trade's arithmetic, never a claim that the trade is profitable or safe to execute. */
export const TRADING_METHOD = 'trading-plan@1';

export function isTradingPlan(o: Obj): boolean {
  return numAt(o, 'entry_price') !== null && (o.stop_price !== undefined || o.take_profit_price !== undefined)
    && (o.direction === 'long' || o.direction === 'short');
}

export function tradingChecks(o: Obj): PlanCheck[] {
  const direction = strAt(o, 'direction');
  const entry = numAt(o, 'entry_price');
  const stop = numAt(o, 'stop_price');
  const target = numAt(o, 'take_profit_price');
  const units = numAt(o, 'size_units');
  const reportedRisk = numAt(o, 'risk_usd');
  const reportedReward = numAt(o, 'reward_usd');
  const reportedRatio = numAt(o, 'risk_reward_ratio');
  const fee = numAt(o, 'fee_usd');
  const slippage = numAt(o, 'slippage_pct');
  const priceOrder = entry !== null && entry > 0 && stop !== null && target !== null
    && (direction === 'long' ? stop < entry && entry < target : target < entry && entry < stop);
  const risk = priceOrder && units !== null && units > 0 ? Math.abs(entry! - stop!) * units : null;
  const reward = priceOrder && units !== null && units > 0 ? Math.abs(target! - entry!) * units : null;
  const amountsPresent = reportedRisk !== null && reportedReward !== null && reportedRatio !== null;
  return [
    check('trading.direction', 'Stop and target fit the trade direction', 'The proposed entry, stop and take-profit prices against the stated long or short direction.',
      stop === null || target === null ? 'not-verified' : priceOrder ? 'passed' : 'failed',
      stop === null || target === null ? 'An entry, stop and target are needed.' : priceOrder ? `${direction}: stop ${stop}, entry ${entry}, target ${target}.` : `The stop and target do not bracket entry ${entry} for a ${direction} trade.`),
    check('trading.exposure', 'Risk and reward follow the price distances', 'The stated risk and reward against size in asset units multiplied by the entry-to-stop and entry-to-target distances, excluding fees.',
      !priceOrder ? 'not-verified' : risk === null || !amountsPresent ? 'not-verified' : close(reportedRisk, risk, 0.01, 0.001) && close(reportedReward, reward!, 0.01, 0.001) ? 'passed' : 'failed',
      !priceOrder ? 'Valid price levels are needed first.' : risk === null || !amountsPresent ? 'Size in asset units, risk, reward and ratio must be stated to recalculate exposure.' : `Calculated risk ${risk.toFixed(2)} and reward ${reward!.toFixed(2)} USD before fees; the answer states ${reportedRisk} and ${reportedReward}.`),
    check('trading.ratio', 'Risk/reward follows the stated amounts', 'The stated reward divided by risk, before fees, against the reported risk/reward ratio.',
      reportedRisk === null || reportedReward === null || reportedRatio === null ? 'not-verified' : reportedRisk <= 0 || reportedReward < 0 || reportedRatio < 0 ? 'failed' : close(reportedRatio, reportedReward / reportedRisk, 0.01, 0.001) ? 'passed' : 'failed',
      reportedRisk === null || reportedReward === null || reportedRatio === null ? 'Risk, reward and ratio are needed.' : `${reportedReward} reward ÷ ${reportedRisk} risk; stated ratio ${reportedRatio}.`),
    check('trading.costs', 'Names fee and slippage assumptions', 'Whether the plan states non-negative fee and slippage assumptions; it does not verify their market accuracy.',
      fee === null || slippage === null ? 'not-verified' : fee >= 0 && slippage >= 0 ? 'passed' : 'failed',
      fee === null || slippage === null ? 'A fee in USD and slippage percentage are needed.' : `Fee ${fee} USD; slippage ${slippage}%.`),
  ];
}

export const TRADING_NOT_COVERED = [
  'Whether quoted prices, liquidity, fees or slippage match the market, or whether any order was executed.',
  'Future price direction, realised profit, liquidation risk and suitability for the buyer.',
];
