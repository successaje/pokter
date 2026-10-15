/**
 * Gridloom's arithmetic, pure.
 *
 * Volatility is realised from hourly price samples: with log returns r over
 * spans of dt hours, σ² per hour = mean(r² / dt), and σ per day = σ_h √24.
 * The automatic range is a ~90% band, price · e^(±1.65 σ_d √days). Levels
 * are geometric, so every step is the same percentage. A round trip (buy one
 * step down, sell one step up) earns the step minus the pool fee twice;
 * the step is never set where that would be a loss.
 */

export const BASES = ['BNB', 'ETH', 'BTC', 'CAKE'] as const;
export type Base = (typeof BASES)[number];

export interface GridBrief {
  base: Base;
  budgetUsd: number;
  range: { lower: number; upper: number } | { pct: number } | null;
  grids: number | null;
  horizonDays: number;
}

const ALIASES: Record<string, Base> = { BNB: 'BNB', WBNB: 'BNB', ETH: 'ETH', WETH: 'ETH', BTC: 'BTC', BTCB: 'BTC', CAKE: 'CAKE' };

export function readGridBrief(brief: string): GridBrief | null {
  const base = brief.match(/\b(WBNB|BNB|WETH|ETH|BTCB|BTC|CAKE)\b/i)?.[1]?.toUpperCase();
  const budget = brief.match(/(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:USDT|USD|\$|dollars)/i) ?? brief.match(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?/i);
  if (!base || !budget) return null;
  const budgetUsd = Number(budget[1].replace(/,/g, '')) * (budget[2] ? 1000 : 1);
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) return null;
  const band = brief.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:-|–|to)\s*(\d[\d,]*(?:\.\d+)?)/);
  const pct = brief.match(/±\s*(\d+(?:\.\d+)?)\s*%|plus or minus\s*(\d+(?:\.\d+)?)\s*%/i);
  const lower = band ? Number(band[1].replace(/,/g, '')) : NaN;
  const upper = band ? Number(band[2].replace(/,/g, '')) : NaN;
  const grids = brief.match(/(\d+)\s*(?:grids?|levels?)/i);
  const days = brief.match(/(\d+)\s*days?/i);
  return {
    base: ALIASES[base],
    budgetUsd,
    range: band && lower > 0 && upper > lower && !/USDT|\$/.test(band[0]) ? { lower, upper } : pct ? { pct: Number(pct[1] ?? pct[2]) } : null,
    grids: grids ? Math.min(100, Math.max(2, Number(grids[1]))) : null,
    horizonDays: days ? Math.min(90, Math.max(1, Number(days[1]))) : 7,
  };
}

/** Daily volatility from (time seconds, price) samples, any spacing. */
export function realisedDailyVol(samples: Array<{ t: number; price: number }>): number | null {
  const sorted = [...samples].filter((s) => s.price > 0).sort((a, b) => a.t - b.t);
  let sum = 0;
  let n = 0;
  for (let i = 1; i < sorted.length; i++) {
    const dtHours = (sorted[i].t - sorted[i - 1].t) / 3600;
    if (dtHours <= 0) continue;
    const r = Math.log(sorted[i].price / sorted[i - 1].price);
    sum += (r * r) / dtHours;
    n += 1;
  }
  return n >= 12 ? Math.sqrt(sum / n) * Math.sqrt(24) : null;
}

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const sig = (value: number) => Number(value.toPrecision(6));

export function gridPlan(input: {
  brief: GridBrief;
  price: number;
  feeRate: number;
  dailyVol: number | null;
}) {
  const { brief, price, feeRate, dailyVol } = input;
  const z = 1.65;
  let lower: number;
  let upper: number;
  let rangeBasis: string;
  if (brief.range && 'lower' in brief.range) {
    ({ lower, upper } = brief.range);
    rangeBasis = 'your range';
  } else if (brief.range && 'pct' in brief.range) {
    lower = price * (1 - brief.range.pct / 100);
    upper = price * (1 + brief.range.pct / 100);
    rangeBasis = `±${brief.range.pct}% around the current price`;
  } else if (dailyVol !== null) {
    const width = z * dailyVol * Math.sqrt(brief.horizonDays);
    lower = price * Math.exp(-width);
    upper = price * Math.exp(width);
    rangeBasis = `about a 90% band for ${brief.horizonDays} days at ${round(dailyVol * 100)}% daily volatility`;
  } else {
    lower = price * 0.9;
    upper = price * 1.1;
    rangeBasis = '±10% (volatility could not be measured)';
  }
  // A step must clear two pool fees with margin, or a round trip loses.
  const minStep = Math.max(2 * feeRate + 0.002, 0.004);
  const span = Math.log(upper / lower);
  const autoGrids = Math.max(4, Math.min(40, Math.floor(span / Math.log(1 + Math.max(minStep, 0.0075)))));
  const grids = brief.grids ?? autoGrids;
  const ratio = Math.exp(span / grids);
  const step = ratio - 1;
  const levels = Array.from({ length: grids + 1 }, (_, i) => lower * ratio ** i);
  const buyLevels = levels.filter((level) => level < price);
  const sellLevels = levels.filter((level) => level > price);
  const orders = buyLevels.length + sellLevels.length;
  const perLevelUsd = orders > 0 ? brief.budgetUsd / orders : 0;
  const baseNeeded = sellLevels.reduce((sum) => sum + perLevelUsd / price, 0);
  const netPerTrip = step - 2 * feeRate;
  // Straight through the range, no round trips: every order on one side fills.
  const keptUsd = brief.budgetUsd - baseNeeded * price;
  const baseIfFalls = baseNeeded + buyLevels.reduce((sum, level) => sum + perLevelUsd / level, 0);
  const usdIfRises = keptUsd + sellLevels.reduce((sum, level) => sum + (perLevelUsd / price) * level * (1 - feeRate), 0);
  const insideNow = price > lower && price < upper;
  return {
    pair: `${brief.base}/USDT`,
    price_now: sig(price),
    range: { lower: sig(lower), upper: sig(upper), basis: rangeBasis },
    ...(insideNow ? {} : { warning: `The current price is outside this range, so the grid starts all on one side and trades only once price returns.` }),
    grid: {
      levels: grids + 1,
      spacing: 'geometric',
      step_pct: round(step * 100, 3),
      buy_orders: buyLevels.map((level) => ({ price: sig(level), usdt: round(perLevelUsd) })),
      sell_orders: sellLevels.map((level) => ({ price: sig(level), [brief.base]: sig(perLevelUsd / price) })),
    },
    setup: {
      budget_usd: brief.budgetUsd,
      per_order_usd: round(perLevelUsd),
      swap_first: baseNeeded > 0 ? `Buy about ${sig(baseNeeded)} ${brief.base} (${round(baseNeeded * price)} USDT) now to stock the sell orders; keep ${round(brief.budgetUsd - baseNeeded * price)} USDT for the buys.` : 'No swap needed: every level is below the price.',
    },
    economics: {
      pool_fee_pct: round(feeRate * 100, 3),
      net_per_round_trip_pct: round(netPerTrip * 100, 3),
      net_per_round_trip_usd: round(perLevelUsd * netPerTrip, 4),
      ...(netPerTrip <= 0 ? { warning: 'The step does not clear two pool fees: every round trip loses. Use fewer grids or a wider range.' } : {}),
      if_price_falls_below_range: `Every buy fills and you hold ${sig(baseIfFalls)} ${brief.base}, worth ${round(baseIfFalls * lower)} USDT at the bottom of the range, and carry any fall below it.`,
      if_price_rises_above_range: `Every sell fills and you hold about ${round(usdIfRises)} USDT, missing any rise above ${sig(upper)}.`,
    },
  };
}
