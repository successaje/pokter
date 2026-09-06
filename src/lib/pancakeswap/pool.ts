import 'server-only';

import { createPublicClient, getAddress, http, type Address } from 'viem';
import { bsc } from 'viem/chains';

/**
 * Live PancakeSwap V3 pool state.
 *
 * Read from the chain rather than an indexer: the numbers below decide whether
 * a user hires an agent, and a stale liquidity figure would understate what a
 * rebalance costs them.
 */

const FACTORY: Address = getAddress('0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865');

export const TOKENS = {
  WBNB: getAddress('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'),
  USDT: getAddress('0x55d398326f99059fF775485246999027B3197955'),
  CAKE: getAddress('0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82'),
  BTCB: getAddress('0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c'),
} as const;

/**
 * Pairs offered in the cost check. Each is a real, deep V3 pool.
 *
 * `quote` names the side a swap is denominated in, because price impact has to
 * be computed in that token's own raw units — comparing a dollar figure against
 * an 18-decimal reserve silently returns zero impact, which is worse than no
 * number at all. `quoteUsd` says how to price that side: USDT is taken as a
 * dollar, and WBNB is priced from the WBNB/USDT pool rather than assumed.
 */
export const PAIRS = [
  {
    id: 'wbnb-usdt',
    label: 'WBNB / USDT',
    a: TOKENS.WBNB,
    b: TOKENS.USDT,
    fee: 500,
    quote: TOKENS.USDT,
    quoteDecimals: 18,
    quoteUsd: 'stable',
  },
  {
    id: 'cake-wbnb',
    label: 'CAKE / WBNB',
    a: TOKENS.CAKE,
    b: TOKENS.WBNB,
    fee: 2500,
    quote: TOKENS.WBNB,
    quoteDecimals: 18,
    quoteUsd: 'wbnb',
  },
  {
    id: 'btcb-wbnb',
    label: 'BTCB / WBNB',
    a: TOKENS.BTCB,
    b: TOKENS.WBNB,
    fee: 2500,
    quote: TOKENS.WBNB,
    quoteDecimals: 18,
    quoteUsd: 'wbnb',
  },
] as const;

export type PairId = (typeof PAIRS)[number]['id'];

const factoryAbi = [
  {
    name: 'getPool',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }],
    outputs: [{ type: 'address' }],
  },
] as const;

const poolAbi = [
  {
    name: 'slot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { type: 'uint160', name: 'sqrtPriceX96' },
      { type: 'int24', name: 'tick' },
      { type: 'uint16' },
      { type: 'uint16' },
      { type: 'uint16' },
      { type: 'uint32' },
      { type: 'bool' },
    ],
  },
  {
    name: 'liquidity',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint128' }],
  },
  {
    name: 'fee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint24' }],
  },
] as const;

export interface PoolState {
  pairId: PairId;
  label: string;
  address: Address;
  /** Fee tier in hundredths of a bip: 500 = 0.05%. */
  feeTier: number;
  tick: number;
  sqrtPriceX96: bigint;
  /** Liquidity active at the current tick. */
  liquidity: bigint;
  /** True when the quote token sorts first, which decides the impact formula. */
  quoteIsToken0: boolean;
  quoteDecimals: number;
  /** USD price of one quote token, read from chain. */
  quoteUsdPrice: number;
  readAt: string;
}

function client() {
  return createPublicClient({
    chain: bsc,
    transport: http(process.env.BSC_RPC_URL ?? 'https://bsc-dataseed.bnbchain.org'),
  });
}

/**
 * USD price of one WBNB, from the WBNB/USDT 0.05% pool.
 *
 * Read rather than hardcoded: a stale BNB price would misprice every
 * WBNB-quoted pool on the page, and the pool is already being read anyway.
 */
async function wbnbUsdPrice(): Promise<number> {
  const pool = await readPool('wbnb-usdt');
  // token0 is USDT (0x55… sorts below 0xbb…), so the raw price is WBNB per
  // USDT; one WBNB costs its reciprocal.
  const raw = (Number(pool.sqrtPriceX96) / Q96) ** 2;
  return raw > 0 ? 1 / raw : 0;
}

const Q96 = 2 ** 96;

export async function readPool(pairId: PairId): Promise<PoolState> {
  const pair = PAIRS.find((p) => p.id === pairId);
  if (!pair) throw new Error(`Unknown pair: ${pairId}`);

  const rpc = client();

  const address = (await rpc.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: 'getPool',
    args: [pair.a, pair.b, pair.fee],
  })) as Address;

  if (/^0x0+$/.test(address)) {
    throw new Error(`No V3 pool deployed for ${pair.label} at ${pair.fee}`);
  }

  const [slot0, liquidity, feeTier] = await Promise.all([
    rpc.readContract({ address, abi: poolAbi, functionName: 'slot0' }),
    rpc.readContract({ address, abi: poolAbi, functionName: 'liquidity' }),
    rpc.readContract({ address, abi: poolAbi, functionName: 'fee' }),
  ]);

  // V3 sorts tokens by address, and which side the quote token landed on
  // decides the direction of the impact formula.
  const quoteIsToken0 =
    pair.quote.toLowerCase() <
    (pair.quote === pair.a ? pair.b : pair.a).toLowerCase();

  return {
    pairId,
    label: pair.label,
    address,
    feeTier: Number(feeTier),
    tick: Number(slot0[1]),
    sqrtPriceX96: slot0[0],
    liquidity,
    quoteIsToken0,
    quoteDecimals: pair.quoteDecimals,
    quoteUsdPrice: pair.quoteUsd === 'stable' ? 1 : await wbnbUsdPrice(),
    readAt: new Date().toISOString(),
  };
}


/**
 * The pool as it crosses to the browser.
 *
 * `sqrtPriceX96` and `liquidity` are BigInts on chain and cannot be serialised
 * into a client component, so they travel as decimal strings and are widened to
 * floats for the cost arithmetic — which is display maths, not settlement.
 */
export interface ClientPool {
  pairId: PairId;
  label: string;
  address: Address;
  feeTier: number;
  tick: number;
  sqrtPriceX96: string;
  liquidity: string;
  quoteIsToken0: boolean;
  quoteDecimals: number;
  quoteUsdPrice: number;
  readAt: string;
}

export function toClientPool(pool: PoolState): ClientPool {
  return {
    ...pool,
    sqrtPriceX96: pool.sqrtPriceX96.toString(),
    liquidity: pool.liquidity.toString(),
  };
}
