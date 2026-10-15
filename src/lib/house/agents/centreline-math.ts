/**
 * Centreline's arithmetic: concentrated-liquidity positions, pure.
 *
 * Standard v3 maths. A tick t prices token1 in token0 at 1.0001^t (before
 * decimals). With liquidity L and square-root prices √P (current), √A and
 * √B (range ends), a position holds:
 *
 *   price below the range   amount0 = L (1/√A − 1/√B),  amount1 = 0
 *   price above the range   amount0 = 0,                amount1 = L (√B − √A)
 *   inside                  amount0 = L (1/√P − 1/√B),  amount1 = L (√P − √A)
 *
 * Out of range a position holds one token and earns nothing; that is the
 * thing a range check exists to say.
 */

export const TICK_SPACING: Record<number, number> = { 100: 1, 500: 10, 2500: 50, 10000: 200 };
const STABLE = new Set(['USDT', 'USDC', 'FDUSD', 'DAI', 'USD1', 'BUSD', 'TUSD', 'U', 'USDE']);

export const isStable = (symbol: string) => STABLE.has(symbol.toUpperCase());

const sqrtAt = (tick: number) => Math.sqrt(1.0001 ** tick);

export function amountsAt(liquidity: number, currentSqrt: number, tickLower: number, tickUpper: number): { raw0: number; raw1: number } {
  const a = sqrtAt(tickLower);
  const b = sqrtAt(tickUpper);
  if (currentSqrt <= a) return { raw0: liquidity * (1 / a - 1 / b), raw1: 0 };
  if (currentSqrt >= b) return { raw0: 0, raw1: liquidity * (b - a) };
  return { raw0: liquidity * (1 / currentSqrt - 1 / b), raw1: liquidity * (currentSqrt - a) };
}

/** Token1 per token0, in whole tokens. */
export const priceAtTick = (tick: number, decimals0: number, decimals1: number) => 1.0001 ** tick * 10 ** (decimals0 - decimals1);

/** The same range width, centred on the current tick and aligned to the pool's spacing. */
export function recentredRange(tick: number, tickLower: number, tickUpper: number, fee: number): { tickLower: number; tickUpper: number } {
  const spacing = TICK_SPACING[fee] ?? 1;
  const width = Math.max(spacing, Math.round((tickUpper - tickLower) / spacing) * spacing);
  const lower = Math.floor((tick - width / 2) / spacing) * spacing;
  return { tickLower: lower, tickUpper: lower + width };
}

export interface PositionInput {
  id: string;
  staked: boolean;
  symbol0: string;
  symbol1: string;
  decimals0: number;
  decimals1: number;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: number;
  tick: number;
  sqrtPrice: number;
  feesRaw0: number | null;
  feesRaw1: number | null;
}

const round = (value: number, places = 6) => Number(value.toPrecision(places));
const pct = (value: number) => Math.round(value * 1000) / 10;

/**
 * Prices in the direction a reader quotes them: the volatile token in the
 * stablecoin (BNB at 610 USDT, not 0.00164 BNB per USDT).
 */
function quoteDirection(p: PositionInput) {
  const flip = isStable(p.symbol0) && !isStable(p.symbol1);
  const base = flip ? p.symbol1 : p.symbol0;
  const quote = flip ? p.symbol0 : p.symbol1;
  const at = (tick: number) => {
    const price = priceAtTick(tick, p.decimals0, p.decimals1);
    return flip ? 1 / price : price;
  };
  return { base, quote, at, flip };
}

export function positionReport(p: PositionInput) {
  const q = quoteDirection(p);
  const lowerPrice = Math.min(q.at(p.tickLower), q.at(p.tickUpper));
  const upperPrice = Math.max(q.at(p.tickLower), q.at(p.tickUpper));
  const current = q.at(p.tick);
  const pair = `${p.symbol0}/${p.symbol1}`;
  const label = `#${p.id} ${pair} ${p.fee / 10_000}%${p.staked ? ' (staked in the PancakeSwap farm)' : ''}`;
  if (p.liquidity === 0) {
    return { position: label, status: 'closed' as const, note: 'No liquidity left: withdrawn already. Nothing to manage.' };
  }
  const { raw0, raw1 } = amountsAt(p.liquidity, p.sqrtPrice, p.tickLower, p.tickUpper);
  const amount0 = raw0 / 10 ** p.decimals0;
  const amount1 = raw1 / 10 ** p.decimals1;
  // Value in the quote token (a stablecoin when either side is one).
  const value = q.flip ? amount0 + amount1 * current : amount0 * current + amount1;
  const inRange = p.tick >= p.tickLower && p.tick < p.tickUpper;
  const placement = inRange ? (p.tick - p.tickLower) / (p.tickUpper - p.tickLower) : null;
  const toReenter = inRange ? null : current < lowerPrice ? lowerPrice / current - 1 : 1 - upperPrice / current;
  const next = recentredRange(p.tick, p.tickLower, p.tickUpper, p.fee);
  const nextLower = Math.min(q.at(next.tickLower), q.at(next.tickUpper));
  const nextUpper = Math.max(q.at(next.tickLower), q.at(next.tickUpper));
  // The split a fresh position needs at the current price, by value in the quote token.
  const unit = amountsAt(1e18, p.sqrtPrice, next.tickLower, next.tickUpper);
  const u0 = unit.raw0 / 10 ** p.decimals0;
  const u1 = unit.raw1 / 10 ** p.decimals1;
  const v0 = q.flip ? u0 : u0 * current;
  const v1 = q.flip ? u1 * current : u1;
  const share0 = v0 + v1 > 0 ? v0 / (v0 + v1) : 0.5;
  const held0Value = q.flip ? amount0 : amount0 * current;
  const swapValue = held0Value - value * share0; // positive: sell token0
  const valueIn = isStable(q.quote) ? 'USD' : q.quote;
  const fees =
    p.feesRaw0 === null || p.feesRaw1 === null
      ? null
      : { [p.symbol0]: round(p.feesRaw0 / 10 ** p.decimals0), [p.symbol1]: round(p.feesRaw1 / 10 ** p.decimals1) };
  return {
    position: label,
    status: inRange ? ('in-range' as const) : ('out-of-range' as const),
    range: { lower: round(lowerPrice), upper: round(upperPrice), unit: `${q.quote} per ${q.base}` },
    price_now: round(current),
    ...(inRange
      ? { placement_pct: pct(placement as number), note: `Earning fees; price sits ${pct(placement as number)}% of the way up the range.` }
      : { move_to_reenter_pct: pct(toReenter as number), note: `Earning no fees: price is ${current < lowerPrice ? 'below' : 'above'} the range and must move ${pct(toReenter as number)}% to re-enter. The position is all ${amount0 > 0 ? p.symbol0 : p.symbol1}.` }),
    holds: { [p.symbol0]: round(amount0), [p.symbol1]: round(amount1) },
    value: { amount: Math.round(value * 100) / 100, in: valueIn },
    uncollected_fees: fees,
    recentre: {
      new_range: { lower: round(nextLower), upper: round(nextUpper), unit: `${q.quote} per ${q.base}` },
      same_width: true,
      ticks: next,
      target_split_pct: { [p.symbol0]: pct(share0), [p.symbol1]: pct(1 - share0) },
      swap: Math.abs(swapValue) < value * 0.005
        ? 'None needed: the holdings already match the new range.'
        : `Swap about ${Math.round(Math.abs(swapValue) * 100) / 100} ${valueIn} worth of ${swapValue > 0 ? p.symbol0 : p.symbol1} into ${swapValue > 0 ? p.symbol1 : p.symbol0}.`,
      steps: [
        p.staked ? 'Withdraw the position from the PancakeSwap farm.' : null,
        'Remove the liquidity and collect the fees.',
        'Swap to the target split above.',
        `Add liquidity in the new range, same ${p.fee / 10_000}% pool.`,
      ].filter(Boolean),
    },
  };
}

/** The wallet named in a brief. */
export function readCentrelineBrief(brief: string): { account: string | null } {
  return { account: brief.match(/0x[0-9a-fA-F]{40}/)?.[0] ?? null };
}
