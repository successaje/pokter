/**
 * Cresthold's arithmetic, pure so every figure can be checked by hand.
 *
 * A venue's net APR at the buyer's size, over their holding period:
 *
 *   net = supply APY after the deposit − one-off costs ÷ amount × 365 ÷ days
 *
 * One-off costs are the swap (valued at Venus's oracle prices, because a
 * stablecoin below its peg makes a token-for-token comparison lie) and
 * gas in and out. It recommends only when the best net beats what the
 * buyer already earns by their threshold, and declines otherwise: moving
 * money to gain less than it costs is the answer a router exists to give.
 */

export const STABLES = ['USDT', 'USDC', 'FDUSD', 'DAI', 'USD1', 'USDE', 'TUSD', 'U'] as const;
export type Stable = (typeof STABLES)[number];

export interface CrestholdBrief {
  amount: number;
  asset: Stable;
  currentAprPct: number;
  holdingDays: number;
  thresholdPp: number;
}

const DAYS_PER_YEAR = 365;

/**
 * A swap losing more than this share of the amount means the only pool is
 * too thin for the size. Such a market is reported as unreachable rather
 * than ranked: a −900% "net APR" is a true number and a useless one.
 */
export const MAX_SWAP_LOSS = 0.02;

export function swapTooCostly(swapCostUsd: number, amountUsd: number): boolean {
  return amountUsd > 0 && swapCostUsd / amountUsd > MAX_SWAP_LOSS;
}

/** The numbers a brief has to carry, or null when it lacks the amount or asset. */
export function readCrestholdBrief(brief: string): CrestholdBrief | null {
  const money = brief.match(/(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\s*(USDT|USDC|FDUSD|DAI|USD1|USDe|TUSD|U)\b/i);
  if (!money) return null;
  const scale = money[2]?.toLowerCase() === 'k' ? 1_000 : money[2]?.toLowerCase() === 'm' ? 1_000_000 : 1;
  const amount = Number(money[1].replace(/,/g, '')) * scale;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const asset = money[3].toUpperCase() as Stable;
  const idle = /\bidle\b|\bnot earning\b|earning (?:nothing|0%)/i.test(brief);
  const current = brief.match(/(?:earning|currently(?: at)?|getting|at)\s*(\d+(?:\.\d+)?)\s*%/i);
  const days = brief.match(/(\d+)\s*days?\b/i) ?? brief.match(/(\d+)\s*(?:weeks?)\b/i);
  const daysValue = days ? Number(days[1]) * (/week/i.test(days[0]) ? 7 : 1) : 30;
  const threshold = brief.match(/(?:at least|by at least|threshold(?: of)?|beats? (?:it |my current yield )?by)\s*(\d+(?:\.\d+)?)\s*(?:pp|percentage points?|points?|%)/i);
  return {
    amount,
    asset,
    currentAprPct: idle ? 0 : current ? Number(current[1]) : 0,
    holdingDays: daysValue >= 1 && daysValue <= 3650 ? daysValue : 30,
    thresholdPp: threshold ? Number(threshold[1]) : 0.5,
  };
}

/** APR and daily-compounded APY (Venus's own convention) from a per-block rate. */
export function ratesFromPerBlock(ratePerBlock: bigint, blocksPerYear: number): { aprPct: number; apyPct: number } {
  const perBlock = Number(ratePerBlock) / 1e18;
  const apr = perBlock * blocksPerYear;
  const apy = (1 + apr / DAYS_PER_YEAR) ** DAYS_PER_YEAR - 1;
  return { aprPct: apr * 100, apyPct: apy * 100 };
}

export interface VenueFigures {
  venue: string;
  market: string;
  asset: Stable;
  apyPct: number;
  /** How `apyPct` reflects the deposit: Venus's own model, or an approximation. */
  rateMethod: string;
  swapCostUsd: number;
  gasUsd: number;
  capRoomUsd: number | null;
  withdrawableUsd: number;
  sources: string[];
}

export function netAprPct(venue: Pick<VenueFigures, 'apyPct' | 'swapCostUsd' | 'gasUsd'>, brief: Pick<CrestholdBrief, 'amount' | 'holdingDays'>): number {
  const oneOff = venue.swapCostUsd + venue.gasUsd;
  return venue.apyPct - (oneOff / brief.amount) * (DAYS_PER_YEAR / brief.holdingDays) * 100;
}

const round = (value: number, places = 3) => Math.round(value * 10 ** places) / 10 ** places;

export function crestholdAnswer(
  brief: CrestholdBrief,
  venues: VenueFigures[],
  asOf: { block: string; time: string },
  unreachable: Array<{ venue: string; reason: string }> = [],
) {
  const rows = venues
    .map((venue) => {
      const fits = venue.capRoomUsd === null || venue.capRoomUsd >= brief.amount;
      return {
        venue: venue.venue,
        market: venue.market,
        asset: venue.asset,
        supply_apy_pct: round(venue.apyPct),
        rate_method: venue.rateMethod,
        costs_usd: { swap: round(venue.swapCostUsd, 2), gas: round(venue.gasUsd, 4) },
        net_apr_pct: round(netAprPct(venue, brief)),
        fits_supply_cap: fits,
        ...(venue.withdrawableUsd < brief.amount ? { exit_warning: `Only ${Math.round(venue.withdrawableUsd).toLocaleString('en-US')} USD is withdrawable now; a full exit may have to wait for borrowers to repay.` } : {}),
        sources: venue.sources,
      };
    })
    .sort((a, b) => b.net_apr_pct - a.net_apr_pct);
  const eligible = rows.filter((row) => row.fits_supply_cap);
  const best = eligible[0] ?? null;
  const beats = best ? best.net_apr_pct - brief.currentAprPct : null;
  const recommend = best !== null && beats !== null && beats >= brief.thresholdPp;
  return {
    question: { amount: brief.amount, asset: brief.asset, current_apr_pct: brief.currentAprPct, holding_days: brief.holdingDays, threshold_pp: brief.thresholdPp },
    as_of: asOf,
    recommend,
    ...(recommend && best
      ? {
          venue: best.venue,
          net_apr_pct: best.net_apr_pct,
          improvement_pp: round(beats as number),
          summary: `Supply on ${best.venue} for a net ${best.net_apr_pct}% APR at ${brief.amount.toLocaleString('en-US')} ${brief.asset} over ${brief.holdingDays} days, ${round(beats as number, 2)} points above your current ${brief.currentAprPct}%.`,
        }
      : {
          decline: best
            ? `Nothing clears your ${brief.thresholdPp}-point threshold: the best, ${best.venue} at a net ${best.net_apr_pct}%, ${(beats as number) >= 0 ? `beats your current ${brief.currentAprPct}% by only ${round(beats as number, 2)}` : `falls short of your current ${brief.currentAprPct}% by ${round(-(beats as number), 2)}`} points after costs. Staying put is the better move.`
            : 'No venue can take this amount within its supply cap.',
        }),
    runner_up: eligible[1] ? { venue: eligible[1].venue, net_apr_pct: eligible[1].net_apr_pct } : null,
    venues: rows,
    ...(unreachable.length ? { unreachable } : {}),
    assumptions: [
      'Rates move every block; the net figure holds only while today’s rate does.',
      'Costs count the swap in and gas in and out; swapping back at exit is not included.',
      'Venus Core Pool markets only. Isolated pools and other protocols are not covered.',
    ],
  };
}
