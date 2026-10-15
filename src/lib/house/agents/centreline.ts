import { getAddress, parseAbi, type Address } from 'viem';

import { settledBlockNumber, venusClient } from '@/lib/assay/venus';

import type { HouseAgentDefinition } from '../types';
import { positionReport, readCentrelineBrief, type PositionInput } from './centreline-math';

const POSITION_MANAGER: Address = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
const FARM: Address = '0x556B9306565093C855AEA9AE92A594704c2Cd59e';
const FACTORY: Address = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const MAX_POSITIONS = 20;
const MAX128 = 2n ** 128n - 1n;

const NFT = parseAbi(['function balanceOf(address) view returns (uint256)', 'function tokenOfOwnerByIndex(address,uint256) view returns (uint256)']);
const MANAGER = parseAbi([
  'function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) returns (uint256 amount0, uint256 amount1)',
]);
const POOL_FACTORY = parseAbi(['function getPool(address,address,uint24) view returns (address)']);
const POOL = parseAbi(['function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint32, bool)']);
const ERC20 = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)']);

type Client = ReturnType<typeof venusClient>;

async function ownedIds(client: Client, holder: Address, owner: Address, block: bigint): Promise<bigint[]> {
  const count = await client.readContract({ address: holder, abi: NFT, functionName: 'balanceOf', args: [owner], blockNumber: block }).catch(() => 0n);
  const ids: bigint[] = [];
  for (let i = 0n; i < count && ids.length < MAX_POSITIONS; i++) {
    ids.push(await client.readContract({ address: holder, abi: NFT, functionName: 'tokenOfOwnerByIndex', args: [owner, i], blockNumber: block }));
  }
  return ids;
}

const tokenInfo = new Map<string, { symbol: string; decimals: number }>();
async function token(client: Client, address: Address) {
  const known = tokenInfo.get(address);
  if (known) return known;
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address, abi: ERC20, functionName: 'symbol' }).catch(() => address.slice(0, 8)),
    client.readContract({ address, abi: ERC20, functionName: 'decimals' }).catch(() => 18),
  ]);
  const info = { symbol: String(symbol), decimals: Number(decimals) };
  tokenInfo.set(address, info);
  return info;
}

/**
 * Uncollected fees, by simulating `collect` as the NFT's holder (the wallet,
 * or the farm for a staked position). An eth_call: nothing is collected.
 */
async function uncollected(client: Client, id: bigint, holder: Address, block: bigint): Promise<{ raw0: number; raw1: number } | null> {
  try {
    const { result } = await client.simulateContract({ account: holder, address: POSITION_MANAGER, abi: MANAGER, functionName: 'collect', args: [{ tokenId: id, recipient: holder, amount0Max: MAX128, amount1Max: MAX128 }], blockNumber: block });
    return { raw0: Number(result[0]), raw1: Number(result[1]) };
  } catch {
    return null;
  }
}

export const centreline: HouseAgentDefinition = {
  slug: 'centreline',
  name: 'Centreline',
  version: '1.0.0',
  category: 'rebalancing',
  description:
    'Rebalancing for PancakeSwap v3 liquidity on BNB Chain. Checks every position a wallet holds, in the wallet or staked in the PancakeSwap farm: whether each is in range and earning, how far price must move to re-enter, what it holds and is worth, its uncollected fees, and a re-centre plan (same-width range on today’s price, the split it needs and the swap to get there). Needs the wallet address. Read-only: it never signs or moves funds.',
  priceU: 0.1,
  skill: {
    id: 'lp_range_check',
    name: 'PancakeSwap v3 range check and re-centre plan',
    description:
      'Give a BNB Chain wallet address. Returns each v3 position with its range, current price, in or out of range, holdings and value, uncollected fees, and a re-centre plan, with the block it was read at.',
    examples: [
      'PancakeSwap V3 range check and re-centre plan for the positions of 0x…',
      'Are the LP positions of 0x… still in range?',
      'Check my PancakeSwap v3 positions: 0x…',
    ],
    tags: ['pancakeswap', 'liquidity', 'rebalancing', 'bnb-chain'],
  },
  deliverables: 'Each PancakeSwap v3 position: range, in or out, distance to re-enter, holdings and value, uncollected fees, and a same-width re-centre plan.',
  qualityStandards: 'Positions, pool prices and fees read from PancakeSwap v3 contracts on BNB Chain mainnet at a stated block.',
  check(brief) {
    return readCentrelineBrief(brief).account ? null : { error: 'The brief names no wallet address', need: 'Include the BNB Chain wallet whose positions to check, e.g. "range check for 0x1234…abcd"' };
  },
  async run(brief) {
    const { account } = readCentrelineBrief(brief);
    if (!account) return { ok: false, error: 'The brief names no wallet address', need: 'Include the wallet to check' };
    const owner = getAddress(account) as Address;
    const client = venusClient();
    const block = await settledBlockNumber(client);
    const [inWallet, inFarm, header] = await Promise.all([ownedIds(client, POSITION_MANAGER, owner, block), ownedIds(client, FARM, owner, block), client.getBlock({ blockNumber: block })]);
    const all = [...inWallet.map((id) => ({ id, staked: false })), ...inFarm.map((id) => ({ id, staked: true }))].slice(0, MAX_POSITIONS);
    const positions = await Promise.all(
      all.map(async ({ id, staked }) => {
        const p = await client.readContract({ address: POSITION_MANAGER, abi: MANAGER, functionName: 'positions', args: [id], blockNumber: block });
        const [token0, token1, fee, tickLower, tickUpper, liquidity] = [p[2], p[3], Number(p[4]), Number(p[5]), Number(p[6]), p[7]];
        const pool = await client.readContract({ address: FACTORY, abi: POOL_FACTORY, functionName: 'getPool', args: [token0, token1, p[4]], blockNumber: block });
        const [slot0, t0, t1, fees] = await Promise.all([
          client.readContract({ address: pool, abi: POOL, functionName: 'slot0', blockNumber: block }),
          token(client, token0),
          token(client, token1),
          liquidity > 0n || p[10] > 0n || p[11] > 0n ? uncollected(client, id, staked ? FARM : owner, block) : Promise.resolve({ raw0: 0, raw1: 0 }),
        ]);
        const input: PositionInput = {
          id: id.toString(), staked,
          symbol0: t0.symbol, symbol1: t1.symbol, decimals0: t0.decimals, decimals1: t1.decimals,
          fee, tickLower, tickUpper,
          liquidity: Number(liquidity),
          tick: Number(slot0[1]),
          sqrtPrice: Number(slot0[0]) / 2 ** 96,
          feesRaw0: fees?.raw0 ?? null,
          feesRaw1: fees?.raw1 ?? null,
        };
        return positionReport(input);
      }),
    );
    const open = positions.filter((p) => p.status !== 'closed');
    const out = open.filter((p) => p.status === 'out-of-range').length;
    return {
      ok: true,
      content: {
        account: owner,
        protocol: 'PancakeSwap v3, BNB Smart Chain mainnet',
        as_of: { block: block.toString(), time: new Date(Number(header.timestamp) * 1000).toISOString() },
        summary:
          all.length === 0
            ? 'No PancakeSwap v3 positions in this wallet or staked in the PancakeSwap farm.'
            : `${open.length} open position${open.length === 1 ? '' : 's'}: ${open.length - out} in range, ${out} out of range and earning nothing${positions.length > open.length ? `; ${positions.length - open.length} closed` : ''}.`,
        positions,
        sources: [
          `PancakeSwap v3 position manager ${POSITION_MANAGER} and farm ${FARM} at block ${block}`,
          'Pool prices from each pool’s slot0; uncollected fees by simulating collect as the position’s holder (nothing was collected).',
        ],
        ...(all.length >= MAX_POSITIONS ? { note: `Only the first ${MAX_POSITIONS} positions were read.` } : {}),
      },
    };
  },
};
