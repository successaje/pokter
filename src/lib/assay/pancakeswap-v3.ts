import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { bsc } from 'viem/chains';

/**
 * Pokter's own reading of a PancakeSwap v3 position, and a way to find
 * wallets that hold one.
 *
 * This is the concentrated-liquidity counterpart to `venus.ts`, and exists
 * for the same reason: a correctness check has to compare the agent's
 * answer with something Pokter worked out independently. Reusing
 * `centreline-math.ts` would check only that the agent read the chain,
 * because both sides would be the same arithmetic.
 *
 * So whether a position is in range is taken from the raw numbers the
 * protocol stores — the position's own tick bounds against the pool's
 * current tick — and nothing here imports the agent.
 *
 * Deliberately not `server-only`: the reads need a client, but the rule
 * for in-range is a comparison of three integers and belongs in tests.
 */

export const V3_POSITION_MANAGER: Address = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
export const V3_FACTORY: Address = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
/** MasterChef v3: a staked position is owned by the farm, not the staker. */
export const V3_FARM: Address = '0x556B9306565093C855AEA9AE92A594704c2Cd59e';

const RPC_URL = process.env.BSC_MAINNET_RPC_URL ?? 'https://bsc-rpc.publicnode.com';

const NFT = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function tokenOfOwnerByIndex(address,uint256) view returns (uint256)',
]);
const MANAGER = parseAbi([
  'function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
]);
const POOL_FACTORY = parseAbi(['function getPool(address,address,uint24) view returns (address)']);
const POOL = parseAbi(['function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint32, bool)']);
const TRANSFER_EVENT = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'])[0];

export function v3Client() {
  return createPublicClient({ chain: bsc, transport: http(RPC_URL), batch: { multicall: true } });
}

/* As in venus.ts: the concrete client, so the read methods are in scope. */
type Client = ReturnType<typeof v3Client>;

/**
 * Whether a position earns at the current price.
 *
 * Uniswap-style ranges are half-open: the lower tick is inside and the
 * upper is not. A position exactly at its upper tick holds one asset and
 * earns nothing, so counting it as in range would call a dead position
 * live.
 */
export function inRange(tick: number, tickLower: number, tickUpper: number): boolean {
  return tick >= tickLower && tick < tickUpper;
}

export interface V3Position {
  id: string;
  /** True when the farm holds the NFT on the wallet's behalf. */
  staked: boolean;
  tickLower: number;
  tickUpper: number;
  /** The pool's tick at the block read. */
  tick: number;
  liquidity: string;
  /** Open means it still has liquidity; a withdrawn position has none. */
  open: boolean;
  inRange: boolean;
}

export interface V3Reading {
  account: Address;
  block: bigint;
  positions: V3Position[];
  openCount: number;
  inRangeCount: number;
}

async function ownedIds(client: Client, holder: Address, owner: Address, block: bigint, max: number): Promise<bigint[]> {
  const count = await client
    .readContract({ address: holder, abi: NFT, functionName: 'balanceOf', args: [owner], blockNumber: block })
    .catch(() => 0n);
  const ids: bigint[] = [];
  for (let i = 0n; i < count && ids.length < max; i += 1n) {
    const id = await client
      .readContract({ address: holder, abi: NFT, functionName: 'tokenOfOwnerByIndex', args: [owner, i], blockNumber: block })
      .catch(() => null);
    if (id !== null) ids.push(id);
  }
  return ids;
}

/**
 * Every v3 position a wallet holds, in the wallet or staked in the farm,
 * with the facts a check can be graded on.
 *
 * Read at one settled block so the position's ticks and the pool's tick
 * cannot come from different states — a position can look in range
 * against a later price and out against the price it was read at.
 */
export async function readV3Positions(
  client: Client,
  account: Address,
  { block, maxPositions = 8 }: { block?: bigint; maxPositions?: number } = {},
): Promise<V3Reading> {
  const at = block ?? (await client.getBlockNumber()) - 3n;
  const [inWallet, inFarm] = await Promise.all([
    ownedIds(client, V3_POSITION_MANAGER, account, at, maxPositions),
    ownedIds(client, V3_FARM, account, at, maxPositions),
  ]);
  const all = [
    ...inWallet.map((id) => ({ id, staked: false })),
    ...inFarm.map((id) => ({ id, staked: true })),
  ].slice(0, maxPositions);

  const positions: V3Position[] = [];
  for (const { id, staked } of all) {
    const p = await client
      .readContract({ address: V3_POSITION_MANAGER, abi: MANAGER, functionName: 'positions', args: [id], blockNumber: at })
      .catch(() => null);
    if (!p) continue;
    const [token0, token1, fee, tickLower, tickUpper, liquidity] = [p[2], p[3], p[4], Number(p[5]), Number(p[6]), p[7]];
    const pool = await client
      .readContract({ address: V3_FACTORY, abi: POOL_FACTORY, functionName: 'getPool', args: [token0, token1, fee], blockNumber: at })
      .catch(() => null);
    if (!pool) continue;
    const slot0 = await client
      .readContract({ address: pool, abi: POOL, functionName: 'slot0', blockNumber: at })
      .catch(() => null);
    if (!slot0) continue;
    const tick = Number(slot0[1]);
    const open = liquidity > 0n;
    positions.push({
      id: id.toString(),
      staked,
      tickLower,
      tickUpper,
      tick,
      liquidity: liquidity.toString(),
      open,
      // A withdrawn position is not "in range": there is nothing in it.
      inRange: open && inRange(tick, tickLower, tickUpper),
    });
  }

  return {
    account,
    block: at,
    positions,
    openCount: positions.filter((p) => p.open).length,
    inRangeCount: positions.filter((p) => p.inRange).length,
  };
}

/**
 * Wallets that currently hold an open v3 position.
 *
 * Found the way `sampleVenusBorrowers` finds borrowers: recent events in
 * 5,000-block windows, which public nodes allow, then each candidate
 * verified by reading its actual positions. A `Transfer` of a position NFT
 * names its new owner, and a mint is a transfer from the zero address, so
 * one event covers both new positions and ones that changed hands.
 *
 * The farm is skipped as a candidate. It holds thousands of positions on
 * other people's behalf, so it would fill the sample with one address that
 * is not a buyer and whose positions belong to strangers.
 */
export async function sampleV3PositionHolders(
  client: Client,
  { count = 3, maxWindows = 40, minOpenPositions = 1 }: { count?: number; maxWindows?: number; minOpenPositions?: number } = {},
): Promise<Address[]> {
  const latest = await client.getBlockNumber();
  const found: Address[] = [];
  const seen = new Set<string>([V3_FARM.toLowerCase(), V3_POSITION_MANAGER.toLowerCase(), '0x0000000000000000000000000000000000000000']);

  for (let w = 0; w < maxWindows && found.length < count; w += 1) {
    const toBlock = latest - BigInt(w) * 5000n;
    const logs = await client
      .getLogs({ address: V3_POSITION_MANAGER, event: TRANSFER_EVENT, fromBlock: toBlock - 4999n, toBlock })
      .catch(() => []);
    for (const log of logs) {
      const owner = log.args.to;
      if (!owner || seen.has(owner.toLowerCase())) continue;
      seen.add(owner.toLowerCase());
      /*
       * One cheap read before the walk. Most recipients of a position NFT
       * no longer hold one — they withdrew, or passed it on — and reading
       * every candidate's positions in full took seventy seconds to find
       * a single holder. `balanceOf` settles it in one call.
       */
      const held = await Promise.all([
        client.readContract({ address: V3_POSITION_MANAGER, abi: NFT, functionName: 'balanceOf', args: [owner], blockNumber: toBlock }).catch(() => 0n),
        client.readContract({ address: V3_FARM, abi: NFT, functionName: 'balanceOf', args: [owner], blockNumber: toBlock }).catch(() => 0n),
      ]);
      if (held[0] + held[1] === 0n) continue;
      // Only whether one position is open, so the walk stops early.
      const reading = await readV3Positions(client, owner, { block: toBlock, maxPositions: Math.max(1, minOpenPositions) }).catch(() => null);
      if (reading && reading.openCount >= minOpenPositions) found.push(owner);
      if (found.length >= count) break;
    }
  }
  return found;
}
