import 'server-only';

import { createPublicClient, fallback, getAddress, http, parseAbi, type Address, type Hex } from 'viem';
import { bsc } from 'viem/chains';

import { mapWithConcurrency } from '@/lib/concurrency';
import { classifyTx, COLLECT_TOPIC, poolCandidates, TRANSFER_TOPIC, type FlowVerdict, type RawLog } from './flows';
import { getTradingStore, type StoredFlow } from './store';

/** PancakeSwap V3's NonfungiblePositionManager on BNB Chain. */
export const POSITION_MANAGER: Address = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
const RPC_URL = process.env.BSC_MAINNET_RPC_URL ?? 'https://bsc-rpc.publicnode.com';
const LOG_CHUNK = 2000n;
/**
 * How far back public RPC still serves logs: measured on 21 October at
 * about 8,000 blocks (an hour), refused at 16,000. The scan stays inside it.
 */
export const REACHABLE_BLOCKS = 6000n;
/** A first scan looks back this far, so a newly watched wallet shows something at once. */
const FIRST_LOOK_BLOCKS = 6000n;

/**
 * The tokens whose transfers are read. Public RPC answers a log query only
 * for named contracts, so this list is what "checked" means; the page names
 * it. The wallet's own position tokens are added per wallet.
 */
export const WATCHED_TOKENS: ReadonlyArray<{ address: Address; symbol: string }> = [
  { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB' },
  { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT' },
  { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC' },
  { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', symbol: 'BTCB' },
  { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', symbol: 'ETH' },
  { address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', symbol: 'CAKE' },
  { address: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409', symbol: 'FDUSD' },
  { address: '0xcE24439F2D9C6a2289F741120FE202248B666666', symbol: 'U' },
];

const PM_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)',
  'function positions(uint256) view returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)',
  'function factory() view returns (address)',
]);
const FACTORY_ABI = parseAbi(['function getPool(address, address, uint24) view returns (address)']);
const V2_FACTORY_ABI = parseAbi(['function getPair(address, address) view returns (address)']);
const POOL_ID_ABI = parseAbi(['function factory() view returns (address)', 'function token0() view returns (address)', 'function token1() view returns (address)', 'function fee() view returns (uint24)']);
/** Read from chain on 21 October 2026: the position manager's own factory, and the factory of the WBNB/USDT V2 pair. */
const V3_FACTORY = '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865';
const V2_FACTORY = '0xca143ce32fe78f1f7019d7d551a6402fc5350c73';
const POOL_ABI = parseAbi(['function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint32, bool)']);
const ERC20_ABI = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)']);

export interface TradingPosition {
  tokenId: string;
  pair: string;
  tokens: [Address, Address];
  feePct: number;
  liquidity: string;
  inRange: boolean | null;
}

export interface TradingHoldings {
  wallet: Address;
  bnb: string;
  tokens: Array<{ symbol: string; amount: string }>;
  positions: TradingPosition[];
  head: string;
  readAt: string;
}

/*
 * Two providers, because each refuses something the other serves: public
 * RPC refused a receipt seconds old as "archive" data on 21 October, and
 * BNB Chain's own node answers receipts but limits log queries.
 */
function client() {
  return createPublicClient({ chain: bsc, transport: fallback([http(RPC_URL), http('https://bsc-dataseed.bnbchain.org')]), batch: { multicall: true } });
}
type Client = ReturnType<typeof client>;

const fmt = (raw: bigint, decimals: number) => {
  const value = Number(raw) / 10 ** decimals;
  // Dust prints as a bound, not as 4e-18.
  if (value > 0 && value < 0.000001) return '< 0.000001';
  return String(Number(value.toPrecision(6)));
};

function tokenInfo(c: Client) {
  const cache = new Map<string, Promise<{ symbol: string; decimals: number }>>();
  return (token: string) => {
    const key = token.toLowerCase();
    if (!cache.has(key)) {
      cache.set(
        key,
        Promise.all([
          c.readContract({ address: token as Address, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => `${token.slice(0, 6)}…`),
          c.readContract({ address: token as Address, abi: ERC20_ABI, functionName: 'decimals' }).catch(() => 18),
        ]).then(([symbol, decimals]) => ({ symbol: String(symbol), decimals: Number(decimals) })),
      );
    }
    return cache.get(key)!;
  };
}

/**
 * Whether an address is a real PancakeSwap pool, V3 or V2, and its two tokens.
 *
 * Asked of the factory, not of the address: any contract can answer
 * `factory()` with PancakeSwap's, so the pool's own tokens (and fee) are
 * read and the factory is asked which pool it made for them. Only its own
 * answer counts. Anything that fails to answer is not a pool, which makes
 * an outflow to it an alert rather than a pass.
 */
function poolCheck(c: Client) {
  const cache = new Map<string, Promise<readonly [string, string] | null>>();
  const check = async (address: Address): Promise<readonly [string, string] | null> => {
    const read = <T,>(functionName: 'factory' | 'token0' | 'token1' | 'fee') => c.readContract({ address, abi: POOL_ID_ABI, functionName }) as Promise<T>;
    const factory = (await read<Address>('factory').catch(() => null))?.toLowerCase();
    if (factory !== V3_FACTORY && factory !== V2_FACTORY) return null;
    const [token0, token1] = await Promise.all([read<Address>('token0'), read<Address>('token1')]);
    const made =
      factory === V3_FACTORY
        ? await c.readContract({ address: V3_FACTORY as Address, abi: FACTORY_ABI, functionName: 'getPool', args: [token0, token1, await read<number>('fee')] })
        : await c.readContract({ address: V2_FACTORY as Address, abi: V2_FACTORY_ABI, functionName: 'getPair', args: [token0, token1] });
    return made.toLowerCase() === address.toLowerCase() ? ([token0.toLowerCase(), token1.toLowerCase()] as const) : null;
  };
  return (address: string) => {
    const key = address.toLowerCase();
    if (!cache.has(key)) cache.set(key, check(key as Address).catch(() => null));
    return cache.get(key)!;
  };
}

/** What the wallet holds now: BNB, the watched tokens it has, and its PancakeSwap V3 positions. */
export async function readHoldings(input: { wallet: Address }): Promise<TradingHoldings> {
  const c = client();
  const info = tokenInfo(c);
  const wallet = getAddress(input.wallet);
  const [head, balance, count, balances] = await Promise.all([
    c.getBlockNumber(),
    c.getBalance({ address: wallet }),
    c.readContract({ address: POSITION_MANAGER, abi: PM_ABI, functionName: 'balanceOf', args: [wallet] }),
    Promise.all(WATCHED_TOKENS.map((t) => c.readContract({ address: t.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [wallet] }).catch(() => 0n))),
  ]);
  const factory = count > 0n ? await c.readContract({ address: POSITION_MANAGER, abi: PM_ABI, functionName: 'factory' }) : null;
  const ids = await Promise.all(Array.from({ length: Number(count > 10n ? 10n : count) }, (_, i) => c.readContract({ address: POSITION_MANAGER, abi: PM_ABI, functionName: 'tokenOfOwnerByIndex', args: [wallet, BigInt(i)] })));
  const positions = await Promise.all(
    ids.map(async (id): Promise<TradingPosition> => {
      const [, , token0, token1, fee, tickLower, tickUpper, liquidity] = await c.readContract({ address: POSITION_MANAGER, abi: PM_ABI, functionName: 'positions', args: [id] });
      const [a, b] = await Promise.all([info(token0), info(token1)]);
      let inRange: boolean | null = null;
      if (factory) {
        const pool = await c.readContract({ address: factory, abi: FACTORY_ABI, functionName: 'getPool', args: [token0, token1, fee] }).catch(() => null);
        const slot = pool ? await c.readContract({ address: pool, abi: POOL_ABI, functionName: 'slot0' }).catch(() => null) : null;
        if (slot) inRange = slot[1] >= tickLower && slot[1] < tickUpper;
      }
      return { tokenId: id.toString(), pair: `${a.symbol}/${b.symbol}`, tokens: [token0, token1], feePct: Number(fee) / 10_000, liquidity: liquidity.toString(), inRange };
    }),
  );
  // Every watched token uses 18 decimals on BNB Chain (USDT and USDC included, unlike on Ethereum).
  const tokens = WATCHED_TOKENS.flatMap((t, i) => (balances[i] > 0n ? [{ symbol: t.symbol, amount: fmt(balances[i], 18) }] : []));
  return { wallet, bnb: fmt(balance, 18), tokens, positions, head: head.toString(), readAt: new Date().toISOString() };
}

/**
 * Every transaction in [fromBlock, toBlock] in which a watched token left
 * the wallet, judged whole (flows.ts). Throws if any part of the range
 * cannot be read, so a caller never records a range as clean that was not
 * read.
 */
export async function scanFlows(input: { wallet: Address; fromBlock: bigint; toBlock: bigint; tokens: readonly Address[]; ownedPositions: ReadonlySet<string>; ownerAddresses: readonly string[] }): Promise<StoredFlow[]> {
  const c = client();
  const info = tokenInfo(c);
  const wallet = getAddress(input.wallet);
  const starts: bigint[] = [];
  for (let s = input.fromBlock; s <= input.toBlock; s += LOG_CHUNK) starts.push(s);
  const walletTopic = `0x${'0'.repeat(24)}${wallet.slice(2).toLowerCase()}` as Hex;
  const range = (start: bigint) => ({ fromBlock: `0x${start.toString(16)}` as Hex, toBlock: `0x${(start + LOG_CHUNK - 1n < input.toBlock ? start + LOG_CHUNK - 1n : input.toBlock).toString(16)}` as Hex });
  const positionTopics = [...input.ownedPositions].map((id) => `0x${BigInt(id).toString(16).padStart(64, '0')}` as Hex);
  type Found = Array<{ transactionHash: Hex; blockNumber: Hex }>;
  const chunks = await mapWithConcurrency(starts, 3, async (start) => {
    /*
     * Transfers out of the wallet, of watched tokens and of position NFTs
     * (the position manager is a Transfer emitter too). And collects from
     * the wallet's positions, which pay a recipient straight from the pool
     * and so move nothing out of the wallet's own balance: without asking
     * for them, a collect to somebody else was never even read.
     */
    const [transfers, collects] = await Promise.all([
      c.request({ method: 'eth_getLogs', params: [{ address: [...input.tokens, POSITION_MANAGER], ...range(start), topics: [TRANSFER_TOPIC as Hex, walletTopic] }] }) as Promise<Found>,
      positionTopics.length ? (c.request({ method: 'eth_getLogs', params: [{ address: POSITION_MANAGER, ...range(start), topics: [COLLECT_TOPIC as Hex, positionTopics] }] }) as Promise<Found>) : Promise.resolve([] as Found),
    ]);
    return [...transfers, ...collects];
  });
  const byTx = new Map<Hex, bigint>();
  for (const log of chunks.flat()) byTx.set(log.transactionHash, BigInt(log.blockNumber));
  const isPool = poolCheck(c);
  const knownTokens = new Set(input.tokens.map((t) => t.toLowerCase()));
  const flows = await mapWithConcurrency([...byTx.entries()], 3, async ([hash, block]) => {
    const receipt = await c.getTransactionReceipt({ hash });
    const logs = receipt.logs as unknown as RawLog[];
    const pools = new Map<string, readonly [string, string]>();
    await Promise.all(poolCandidates(wallet, logs).map(async (a) => { const tokens = await isPool(a); if (tokens) pools.set(a, tokens); }));
    const f = classifyTx({ wallet, logs, positionManager: POSITION_MANAGER, ownedPositions: input.ownedPositions, ownerAddresses: input.ownerAddresses, knownTokens, pools });
    if (!f.verdict) return null;
    const blk = await c.getBlock({ blockNumber: block });
    const sent = await Promise.all(
      f.outs.map(async (o) => {
        // Read as "<amount> <symbol>" on the page and in the alert: "Position #7", "Tokens from position #7".
        if (o.kind === 'position') return { amount: 'Position', symbol: `#${o.positionId}`, to: o.to };
        if (o.kind === 'collect') return { amount: 'Tokens from', symbol: `position #${o.positionId}`, to: o.to };
        const t = await info(o.token);
        return { symbol: t.symbol, amount: fmt(o.amount, t.decimals), to: o.to };
      }),
    );
    return { txHash: hash as string, wallet: wallet.toLowerCase(), block: Number(block), at: new Date(Number(blk.timestamp) * 1000).toISOString(), verdict: f.verdict as FlowVerdict, note: f.note, sent } satisfies StoredFlow;
  });
  return flows.filter((f): f is StoredFlow => f !== null);
}

/**
 * Scan one watched wallet from where it left off to the head. A range that
 * has fallen out of public RPC's reach is recorded as a gap, never as clean.
 */
export async function scanWatchedWallet(wallet: string): Promise<{ flows: number; notReturned: number; gap: boolean }> {
  const store = getTradingStore();
  const watched = store.get(wallet);
  if (!watched) return { flows: 0, notReturned: 0, gap: false };
  try {
    const holdings = await readHoldings({ wallet: getAddress(wallet) });
    const head = BigInt(holdings.head);
    const floor = head > REACHABLE_BLOCKS ? head - REACHABLE_BLOCKS : 0n;
    let from = watched.scannedTo === null ? (head > FIRST_LOOK_BLOCKS ? head - FIRST_LOOK_BLOCKS : 0n) : BigInt(watched.scannedTo) + 1n;
    let gap: { fromBlock: number; toBlock: number } | null = null;
    if (from < floor) {
      gap = { fromBlock: Number(from), toBlock: Number(floor - 1n) };
      from = floor;
    }
    if (from > head) {
      store.recordScan({ wallet, scannedTo: null, error: null, flows: [], gap });
      return { flows: 0, notReturned: 0, gap: Boolean(gap) };
    }
    const tokens = [...new Set([...WATCHED_TOKENS.map((t) => t.address.toLowerCase()), ...holdings.positions.flatMap((p) => p.tokens.map((t) => t.toLowerCase()))])] as Address[];
    const flows = await scanFlows({ wallet: getAddress(wallet), fromBlock: from, toBlock: head, tokens, ownedPositions: new Set(holdings.positions.map((p) => p.tokenId)), ownerAddresses: watched.owners });
    store.recordScan({ wallet, scannedTo: Number(head), error: null, flows, gap });
    return { flows: flows.length, notReturned: flows.filter((f) => f.verdict === 'not-returned').length, gap: Boolean(gap) };
  } catch (error) {
    store.recordScan({ wallet, scannedTo: null, error: (error as Error).message.slice(0, 200), flows: [], gap: null });
    return { flows: 0, notReturned: 0, gap: false };
  }
}

/** The sweep's pass: every watched trading wallet, least recently scanned first. */
export async function scanTradingWallets(max = 20): Promise<{ scanned: number; flows: number; notReturned: number; gaps: number }> {
  const due = getTradingStore().due(max);
  const results = await mapWithConcurrency(due, 2, (w) => scanWatchedWallet(w.wallet));
  return { scanned: results.length, flows: results.reduce((n, r) => n + r.flows, 0), notReturned: results.reduce((n, r) => n + r.notReturned, 0), gaps: results.filter((r) => r.gap).length };
}
