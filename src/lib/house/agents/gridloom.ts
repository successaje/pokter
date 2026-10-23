import { parseAbi, type Address } from 'viem';

import { settledBlockNumber, venusClient } from '@/lib/assay/venus';

import type { HouseAgentDefinition } from '../types';
import { gridPlan, readGridBrief, realisedDailyVol, type Base } from './gridloom-math';

const USDT: Address = '0x55d398326f99059fF775485246999027B3197955';
const TOKENS: Record<Base, Address> = {
  BNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  ETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
  BTC: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
  CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
};
/** Chainlink USD feeds on BNB Chain: every past round stays readable, so a week of history needs no archive node. */
const FEEDS: Record<Base, Address> = {
  BNB: '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE',
  ETH: '0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e',
  BTC: '0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf',
  CAKE: '0xB6064eD41d4f67e353768aA239cA86f4F73665a1',
};
const FACTORY: Address = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const FACTORY_ABI = parseAbi(['function getPool(address,address,uint24) view returns (address)']);
const POOL_ABI = parseAbi(['function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint32, bool)', 'function liquidity() view returns (uint128)', 'function token0() view returns (address)']);
const FEED_ABI = parseAbi(['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)', 'function getRoundData(uint80) view returns (uint80, int256, uint256, uint256, uint80)', 'function decimals() view returns (uint8)']);
const HOURS = 168;

type Client = ReturnType<typeof venusClient>;

/** The deepest PancakeSwap v3 pool for the pair: its price is what a grid would actually trade at. */
async function deepestPool(client: Client, base: Base) {
  let best: { pool: Address; fee: number; liquidity: bigint; price: number } | null = null;
  for (const fee of [100, 500, 2500]) {
    const pool = await client.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: 'getPool', args: [TOKENS[base], USDT, fee] });
    if (/^0x0+$/.test(pool)) continue;
    const [slot0, liquidity, token0] = await Promise.all([
      client.readContract({ address: pool, abi: POOL_ABI, functionName: 'slot0' }),
      client.readContract({ address: pool, abi: POOL_ABI, functionName: 'liquidity' }),
      client.readContract({ address: pool, abi: POOL_ABI, functionName: 'token0' }),
    ]);
    // Both tokens have 18 decimals; price is token1 per token0.
    const raw = (Number(slot0[0]) / 2 ** 96) ** 2;
    const price = token0.toLowerCase() === USDT.toLowerCase() ? 1 / raw : raw;
    if (!best || liquidity > best.liquidity) best = { pool, fee, liquidity, price };
  }
  return best;
}

/** One Chainlink round per hour for a week, sampled by round number from the observed update rate. */
async function hourlyFeed(client: Client, base: Base): Promise<{ samples: Array<{ t: number; price: number }>; latest: number }> {
  const feed = FEEDS[base];
  const [latest, decimals] = await Promise.all([client.readContract({ address: feed, abi: FEED_ABI, functionName: 'latestRoundData' }), client.readContract({ address: feed, abi: FEED_ABI, functionName: 'decimals' })]);
  const scale = 10 ** decimals;
  const phase = latest[0] >> 64n;
  const round = latest[0] & ((1n << 64n) - 1n);
  const probe = round > 300n ? await client.readContract({ address: feed, abi: FEED_ABI, functionName: 'getRoundData', args: [(phase << 64n) | (round - 300n)] }).catch(() => null) : null;
  const secondsPerRound = probe && latest[3] > probe[3] ? Number(latest[3] - probe[3]) / 300 : 60;
  const stride = BigInt(Math.max(1, Math.round(3600 / secondsPerRound)));
  const ids: bigint[] = [];
  for (let i = 0n; i < BigInt(HOURS) && round - i * stride > 0n; i++) ids.push((phase << 64n) | (round - i * stride));
  const results = await client.multicall({ contracts: ids.map((id) => ({ address: feed, abi: FEED_ABI, functionName: 'getRoundData', args: [id] })), allowFailure: true });
  const samples = results.flatMap((r) => {
    if (r.status !== 'success') return [];
    const [, answer, , updatedAt] = r.result as readonly [bigint, bigint, bigint, bigint, bigint];
    return updatedAt > 0n && answer > 0n ? [{ t: Number(updatedAt), price: Number(answer) / scale }] : [];
  });
  return { samples, latest: Number(latest[1]) / scale };
}

export const gridloom: HouseAgentDefinition = {
  slug: 'gridloom',
  name: 'Gridloom by Pokter',
  version: '1.0.0',
  category: 'grid-trading',
  description:
    'Plans a grid for BNB, ETH, BTC or CAKE against USDT on BNB Chain: a range sized from a week of realised volatility (or the range you give), geometric levels whose step always clears the PancakeSwap pool fee twice, the order at each level, the swap to set it up, the net per round trip, and what you hold if price leaves the range. Needs the asset and a budget. A plan, not an execution: it never signs or trades.',
  priceU: 0.08,
  skill: {
    id: 'grid_plan',
    name: 'Grid plan from live price and realised volatility',
    description:
      'Give an asset (BNB, ETH, BTC or CAKE) and a budget in USDT, optionally a range ("600-800" or "±10%"), a number of grids and a horizon in days. Returns the range and its basis, every level with its order, the setup swap and the economics after fees.',
    examples: ['Grid plan for BNB with 1000 USDT', 'ETH grid, 500 USDT, ±8%, 12 grids', 'BTC grid with 2000 USDT for 14 days'],
    tags: ['grid', 'pancakeswap', 'volatility', 'bnb-chain'],
  },
  deliverables: 'A grid plan: range and its basis, every level with its order size, the setup swap, net profit per round trip after fees, and holdings if price leaves the range.',
  qualityStandards: 'Price from the deepest PancakeSwap v3 pool and a week of hourly Chainlink rounds on BNB Chain mainnet, at a stated block.',
  check(brief) {
    return readGridBrief(brief) ? null : { error: 'The brief names no asset and budget', need: 'Say which asset (BNB, ETH, BTC or CAKE) and how many USDT, e.g. "Grid plan for BNB with 1000 USDT"' };
  },
  async run(brief) {
    const question = readGridBrief(brief);
    if (!question) return { ok: false, error: 'The brief names no asset and budget', need: 'Say which asset and how many USDT' };
    const client = venusClient();
    const block = await settledBlockNumber(client);
    const [pool, feed, header] = await Promise.all([deepestPool(client, question.base), hourlyFeed(client, question.base), client.getBlock({ blockNumber: block })]);
    if (!pool) return { ok: false, error: `No PancakeSwap v3 pool for ${question.base}/USDT`, need: 'Choose BNB, ETH, BTC or CAKE' };
    const dailyVol = realisedDailyVol(feed.samples);
    const plan = gridPlan({ brief: question, price: pool.price, feeRate: pool.fee / 1_000_000, dailyVol });
    return {
      ok: true,
      content: {
        ...plan,
        volatility: dailyVol === null ? null : { daily_pct: Math.round(dailyVol * 10_000) / 100, samples: feed.samples.length, window: 'hourly Chainlink rounds, last 7 days' },
        reference_price: { chainlink_usd: Number(feed.latest.toPrecision(6)), pool_vs_chainlink_pct: Math.round((pool.price / feed.latest - 1) * 10_000) / 100 },
        as_of: { block: block.toString(), time: new Date(Number(header.timestamp) * 1000).toISOString() },
        sources: [`PancakeSwap v3 ${question.base}/USDT ${pool.fee / 10_000}% pool ${pool.pool} (deepest) at block ${block}`, `Chainlink ${question.base}/USD feed ${FEEDS[question.base]}, ${feed.samples.length} hourly rounds`],
        assumptions: ['Volatility is the last week’s; the range is a band, not a forecast.', 'Each fill is a swap in the same pool and pays its fee; gas and slippage on small orders are not included.'],
      },
    };
  },
};
