import { parseAbi, type Address } from 'viem';

import { VENUS_COMPTROLLER, venusClient } from '@/lib/assay/venus';

import type { HouseAgentDefinition } from '../types';
import { crestholdAnswer, ratesFromPerBlock, readCrestholdBrief, STABLES, swapTooCostly, type Stable, type VenueFigures } from './cresthold-math';

const COMPTROLLER = parseAbi(['function getAllMarkets() view returns (address[])', 'function supplyCaps(address) view returns (uint256)', 'function oracle() view returns (address)']);
const VTOKEN = parseAbi([
  'function symbol() view returns (string)',
  'function underlying() view returns (address)',
  'function supplyRatePerBlock() view returns (uint256)',
  'function interestRateModel() view returns (address)',
  'function getCash() view returns (uint256)',
  'function totalBorrows() view returns (uint256)',
  'function totalReserves() view returns (uint256)',
  'function reserveFactorMantissa() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function exchangeRateStored() view returns (uint256)',
]);
const IRM = parseAbi(['function blocksPerYear() view returns (uint256)', 'function getSupplyRate(uint256 cash, uint256 borrows, uint256 reserves, uint256 reserveFactorMantissa) view returns (uint256)']);
const ORACLE = parseAbi(['function getUnderlyingPrice(address) view returns (uint256)']);
const QUOTER: Address = '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';
const QUOTE = parseAbi(['function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)']);
const VBNB: Address = '0xA07c5b74C9B40447a954e1466938b865b6BBea36';
/** Venus's own figure for BNB Chain, published by its rate models (0.45 s blocks). */
const VENUS_BLOCKS_PER_YEAR = 70_080_000;
/** Gas for approve + supply, and redeem at exit; a swap adds the quoter's estimate plus router overhead. */
const GAS = { approve: 46_000, supply: 250_000, redeem: 200_000, routerOverhead: 60_000 };

type Client = ReturnType<typeof venusClient>;

interface Market {
  vToken: Address;
  asset: Stable;
  underlying: Address;
  ratePerBlock: bigint;
  model: Address;
  cash: bigint;
  borrows: bigint;
  reserves: bigint;
  reserveFactor: bigint;
  suppliedUnderlying: bigint;
  cap: bigint;
  priceUsd: number;
}

async function stableMarkets(client: Client, block: bigint): Promise<Market[]> {
  const read = <T>(address: Address, abi: readonly unknown[], functionName: string, args: unknown[] = []) =>
    client.readContract({ address, abi: abi as never, functionName: functionName as never, args: args as never, blockNumber: block }) as Promise<T>;
  const [markets, oracle] = await Promise.all([read<Address[]>(VENUS_COMPTROLLER, COMPTROLLER, 'getAllMarkets'), read<Address>(VENUS_COMPTROLLER, COMPTROLLER, 'oracle')]);
  const symbols = await Promise.all(markets.map((m) => read<string>(m, VTOKEN, 'symbol').catch(() => '')));
  const picked = markets.map((vToken, i) => ({ vToken, asset: symbols[i].replace(/^v/, '').toUpperCase() })).filter((m) => (STABLES as readonly string[]).includes(m.asset));
  return Promise.all(
    picked.map(async ({ vToken, asset }) => {
      const [underlying, ratePerBlock, model, cash, borrows, reserves, reserveFactor, supply, exchangeRate, cap, price] = await Promise.all([
        read<Address>(vToken, VTOKEN, 'underlying'),
        read<bigint>(vToken, VTOKEN, 'supplyRatePerBlock'),
        read<Address>(vToken, VTOKEN, 'interestRateModel'),
        read<bigint>(vToken, VTOKEN, 'getCash'),
        read<bigint>(vToken, VTOKEN, 'totalBorrows'),
        read<bigint>(vToken, VTOKEN, 'totalReserves'),
        read<bigint>(vToken, VTOKEN, 'reserveFactorMantissa'),
        read<bigint>(vToken, VTOKEN, 'totalSupply'),
        read<bigint>(vToken, VTOKEN, 'exchangeRateStored'),
        read<bigint>(VENUS_COMPTROLLER, COMPTROLLER, 'supplyCaps', [vToken]),
        read<bigint>(oracle, ORACLE, 'getUnderlyingPrice', [vToken]),
      ]);
      return {
        vToken, asset: asset as Stable, underlying, ratePerBlock, model, cash, borrows, reserves, reserveFactor,
        suppliedUnderlying: (supply * exchangeRate) / 10n ** 18n,
        cap,
        // Every listed stablecoin has 18 decimals on BNB Chain, so price / 1e18 is USD.
        priceUsd: Number(price) / 1e18,
      } satisfies Market;
    }),
  );
}

/** The supply rate once `amount` is added: Venus's own model, or the dilution approximation. */
async function rateAfterDeposit(client: Client, market: Market, amountWei: bigint, block: bigint): Promise<{ ratePerBlock: bigint; method: string }> {
  try {
    const rate = await client.readContract({ address: market.model, abi: IRM, functionName: 'getSupplyRate', args: [market.cash + amountWei, market.borrows, market.reserves, market.reserveFactor], blockNumber: block });
    return { ratePerBlock: rate, method: 'Venus rate model with this deposit added' };
  } catch {
    const pool = market.cash + market.borrows - market.reserves;
    const diluted = pool > 0n ? (market.ratePerBlock * pool) / (pool + amountWei) : market.ratePerBlock;
    return { ratePerBlock: diluted, method: 'approximate: today’s rate diluted by the deposit (an upper bound, since borrow rates also fall)' };
  }
}

async function swapQuote(client: Client, from: Market, to: Market, amountWei: bigint, block: bigint): Promise<{ out: bigint; fee: number; gas: bigint } | null> {
  let best: { out: bigint; fee: number; gas: bigint } | null = null;
  for (const fee of [100, 500]) {
    try {
      const { result } = await client.simulateContract({ address: QUOTER, abi: QUOTE, functionName: 'quoteExactInputSingle', args: [{ tokenIn: from.underlying, tokenOut: to.underlying, amountIn: amountWei, fee, sqrtPriceLimitX96: 0n }], blockNumber: block });
      if (!best || result[0] > best.out) best = { out: result[0], fee, gas: result[3] };
    } catch {
      /* No pool at this fee tier. */
    }
  }
  return best;
}

export const cresthold: HouseAgentDefinition = {
  slug: 'cresthold',
  name: 'Cresthold',
  version: '1.0.0',
  category: 'yield',
  description:
    'Finds where a stablecoin amount earns the most on Venus Core Pool, net of what moving costs: the supply rate after your deposit, the PancakeSwap swap if the best market is another stablecoin, and gas in and out, spread over how long you hold. Recommends only when the best beats what you earn now by your threshold, and declines otherwise. Needs the amount and stablecoin; read-only, Venus Core Pool only.',
  priceU: 0.1,
  skill: {
    id: 'net_yield_at_size',
    name: 'Net stablecoin yield at your size',
    description:
      'Give an amount and stablecoin (USDT, USDC, FDUSD, DAI, USD1, USDe, TUSD or U), and optionally what it earns now, how many days you will hold, and the improvement worth moving for. Returns the best Venus market by net APR, the runner-up and every market with its costs and sources, or a decline.',
    examples: [
      'Where should 1000 USDT earn the most on BNB Chain right now?',
      '5000 USDC currently earning 2%, holding 30 days: is there a better Venus market by at least 0.5 points?',
      'Best net yield for 250 FDUSD over 90 days',
    ],
    tags: ['yield', 'venus', 'stablecoin', 'bnb-chain'],
  },
  deliverables: 'The best Venus Core market by net APR at your size and holding period, the runner-up and every market itemised with costs and sources, or an explicit decline.',
  qualityStandards: 'Rates, caps, prices and swap quotes read from Venus and PancakeSwap on BNB Chain mainnet at a stated block.',
  check(brief) {
    if (!readCrestholdBrief(brief)) {
      return { error: 'The brief names no amount and stablecoin', need: 'Say how much and which stablecoin, e.g. "1000 USDT"' };
    }
    return null;
  },
  async run(brief) {
    const question = readCrestholdBrief(brief);
    if (!question) return { ok: false, error: 'The brief names no amount and stablecoin', need: 'Say how much and which stablecoin' };
    const client = venusClient();
    const block = await client.getBlockNumber();
    const [markets, header, gasPrice] = await Promise.all([stableMarkets(client, block), client.getBlock({ blockNumber: block }), client.getGasPrice()]);
    const from = markets.find((m) => m.asset === question.asset);
    if (!from) return { ok: false, error: `${question.asset} has no Venus Core market`, need: `Use one of ${markets.map((m) => m.asset).join(', ')}` };
    const oracle = await client.readContract({ address: VENUS_COMPTROLLER, abi: COMPTROLLER, functionName: 'oracle', blockNumber: block });
    const bnbUsd = Number(await client.readContract({ address: oracle, abi: ORACLE, functionName: 'getUnderlyingPrice', args: [VBNB], blockNumber: block })) / 1e18;
    const amountWei = BigInt(Math.round(question.amount * 1e6)) * 10n ** 12n;
    const gasUsd = (units: number) => (Number(gasPrice) * units * bnbUsd) / 1e18;

    const venues: VenueFigures[] = [];
    const unreachable: Array<{ venue: string; reason: string }> = [];
    for (const to of markets) {
      const sources = [`Venus ${to.asset} market ${to.vToken} at block ${block}`];
      let depositWei = amountWei;
      let swapCostUsd = 0;
      let gasUnits = GAS.approve + GAS.supply + GAS.redeem;
      if (to.asset !== from.asset) {
        const quote = await swapQuote(client, from, to, amountWei, block);
        if (!quote) {
          unreachable.push({ venue: `Venus ${to.asset}`, reason: `No PancakeSwap v3 pool from ${from.asset} to ${to.asset}.` });
          continue;
        }
        depositWei = quote.out;
        swapCostUsd = Math.max(0, question.amount * from.priceUsd - (Number(quote.out) / 1e18) * to.priceUsd);
        if (swapTooCostly(swapCostUsd, question.amount * from.priceUsd)) {
          unreachable.push({ venue: `Venus ${to.asset}`, reason: `Swapping ${question.amount.toLocaleString('en-US')} ${from.asset} to ${to.asset} would lose ${Math.round(swapCostUsd).toLocaleString('en-US')} USD in the deepest PancakeSwap pool: too thin for this size.` });
          continue;
        }
        gasUnits += GAS.approve + Number(quote.gas) + GAS.routerOverhead;
        sources.push(`PancakeSwap v3 quote ${from.asset}→${to.asset}, ${quote.fee / 10_000}% pool, at block ${block}, valued at Venus oracle prices`);
      }
      const rate = await rateAfterDeposit(client, to, depositWei, block);
      const { apyPct } = ratesFromPerBlock(rate.ratePerBlock, VENUS_BLOCKS_PER_YEAR);
      venues.push({
        venue: `Venus ${to.asset}`,
        market: to.vToken,
        asset: to.asset,
        apyPct,
        rateMethod: rate.method,
        swapCostUsd,
        gasUsd: gasUsd(gasUnits),
        capRoomUsd: to.cap === 0n ? null : (Number(to.cap - to.suppliedUnderlying) / 1e18) * to.priceUsd,
        withdrawableUsd: (Number(to.cash) / 1e18) * to.priceUsd,
        sources,
      });
    }
    return { ok: true, content: crestholdAnswer(question, venues, { block: block.toString(), time: new Date(Number(header.timestamp) * 1000).toISOString() }, unreachable) };
  },
};
