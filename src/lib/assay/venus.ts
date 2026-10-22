import { createPublicClient, encodeFunctionData, http, parseAbi, parseAbiItem, type Address } from 'viem';
import { bsc } from 'viem/chains';

/**
 * Pokter's own reading of a Venus Core Pool position on BNB Smart Chain.
 *
 * The health factor is derived from Venus's own accounting rather than
 * re-implemented: `getAccountLiquidity` returns the account's spare
 * borrowing capacity or its shortfall in USD, already weighted by Venus's
 * factors and priced by Venus's oracle. With the USD value of the debt,
 *
 *   weighted collateral = debt + liquidity - shortfall
 *   health factor       = weighted collateral / debt
 *
 * which is below 1 exactly when Venus reports a shortfall, the condition
 * under which the position can be liquidated. Venus weights this on each
 * market's liquidation threshold, which can exceed its collateral factor
 * (FDUSD: 0.75 against 0.65), so the borrowing-limit ratio on collateral
 * factors is computed alongside, to tell a different definition apart from
 * a wrong answer.
 */
export const VENUS_COMPTROLLER: Address = '0xfD36E2c2a6789Db23113685031d7F16329158384';
const RPC_URL = process.env.BSC_MAINNET_RPC_URL ?? 'https://bsc-rpc.publicnode.com';

const COMPTROLLER_ABI = parseAbi([
  'function oracle() view returns (address)',
  'function getAllMarkets() view returns (address[])',
  'function getAssetsIn(address) view returns (address[])',
  'function getAccountLiquidity(address) view returns (uint256, uint256, uint256)',
]);
const VTOKEN_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function getAccountSnapshot(address) view returns (uint256, uint256, uint256, uint256)',
]);
/*
 * markets(vToken) returns (isListed, collateralFactor, isVenus,
 * liquidationThreshold, ...). Read as raw words so a change in the trailing
 * fields cannot break decoding of the two we use.
 */
const MARKETS_SELECTOR = parseAbi(['function markets(address) view returns (bool, uint256, bool)']);
const ORACLE_ABI = parseAbi(['function getUnderlyingPrice(address) view returns (uint256)']);
const BORROW_EVENT = parseAbiItem('event Borrow(address borrower, uint256 borrowAmount, uint256 accountBorrows, uint256 totalBorrows)');
const REPAY_EVENT = parseAbiItem('event RepayBorrow(address payer, address borrower, uint256 repayAmount, uint256 accountBorrows, uint256 totalBorrows)');

/**
 * A block every node behind a load-balanced public RPC already has.
 *
 * Reads pinned to the newest block failed now and then with "block not
 * found": one node reported the head and the next request landed on a
 * node a block or two behind. Three blocks is about a second and a half
 * on BNB Chain, nothing for a reading that is reported with its block.
 */
export async function settledBlockNumber(client: { getBlockNumber(): Promise<bigint> }): Promise<bigint> {
  const head = await client.getBlockNumber();
  return head > 3n ? head - 3n : head;
}

export function venusClient() {
  return createPublicClient({ chain: bsc, transport: http(RPC_URL), batch: { multicall: true } });
}
type Client = ReturnType<typeof venusClient>;

/** HF from Venus's liquidity figures, all in USD with 18 decimals. Null when there is no debt. */
export function healthFromLiquidity(borrowUsd: bigint, liquidity: bigint, shortfall: bigint): number | null {
  if (borrowUsd <= 0n) return null;
  const weighted = borrowUsd + liquidity - shortfall;
  // Keep six decimals of precision through the integer division.
  return Number((weighted * 1_000_000n) / borrowUsd) / 1_000_000;
}

export interface VenusReading {
  account: Address;
  /** On liquidation thresholds: what Venus liquidates on. Null with no debt. */
  healthFactor: number | null;
  /**
   * The same ratio on collateral factors: the borrowing-limit view. Lower
   * than the health factor wherever a market's threshold exceeds its
   * collateral factor. Null with no debt.
   */
  borrowLimitRatio: number | null;
  liquidatable: boolean;
  borrowUsd: number;
  block: bigint;
  /**
   * The position as rows a calculator can take: each market's supply and
   * borrow in USD at Venus's oracle price, with its liquidation threshold.
   * Amounts are USD values and every price is 1, so no token decimals are
   * involved. Sent with the question so an agent that computes from inputs
   * can answer as well as one that reads the chain itself.
   */
  rows: {
    collateral: Record<string, { amount: number; liqThreshold: number }>;
    debt: Record<string, number>;
    prices: Record<string, number>;
  };
}

const usd = (raw: bigint) => Number((raw * 100n) / 10n ** 18n) / 100;

/**
 * `atBlock` pins every call below to one block instead of taking the
 * settled head.
 *
 * Added for delivery verification (`lib/delivery/venus-report-check.ts`),
 * which checks a report against the block the report itself names. Without
 * it the only way to get a reading at a stated block was to copy this
 * function, and two readings of Venus that could drift apart is exactly the
 * thing a correctness check must not have.
 */
export async function readVenusPosition(client: Client, account: Address, { atBlock }: { atBlock?: bigint } = {}): Promise<VenusReading> {
  const block = atBlock ?? (await settledBlockNumber(client));
  const [oracle, assets, liquidityTuple] = await Promise.all([
    client.readContract({ address: VENUS_COMPTROLLER, abi: COMPTROLLER_ABI, functionName: 'oracle', blockNumber: block }),
    client.readContract({ address: VENUS_COMPTROLLER, abi: COMPTROLLER_ABI, functionName: 'getAssetsIn', args: [account], blockNumber: block }),
    client.readContract({ address: VENUS_COMPTROLLER, abi: COMPTROLLER_ABI, functionName: 'getAccountLiquidity', args: [account], blockNumber: block }),
  ]);
  const [error, liquidity, shortfall] = liquidityTuple;
  if (error !== 0n) throw new Error(`Venus reported error ${error} for this account.`);
  const legs = await Promise.all(
    assets.map(async (vToken) => {
      const [snapshot, price, markets, symbol] = await Promise.all([
        client.readContract({ address: vToken, abi: VTOKEN_ABI, functionName: 'getAccountSnapshot', args: [account], blockNumber: block }),
        client.readContract({ address: oracle, abi: ORACLE_ABI, functionName: 'getUnderlyingPrice', args: [vToken], blockNumber: block }),
        client.call({ to: VENUS_COMPTROLLER, data: encodeFunctionData({ abi: MARKETS_SELECTOR, functionName: 'markets', args: [vToken] }), blockNumber: block }),
        client.readContract({ address: vToken, abi: VTOKEN_ABI, functionName: 'symbol', blockNumber: block }).catch(() => vToken.slice(0, 10)),
      ]);
      const [, vBalance, borrow, exchangeRate] = snapshot;
      const words = (markets.data ?? '0x').slice(2).match(/.{64}/g) ?? [];
      const collateralFactor = words[1] ? BigInt(`0x${words[1]}`) : 0n;
      // The fourth word is the liquidation threshold; markets without one liquidate on the collateral factor.
      const threshold = words[3] ? BigInt(`0x${words[3]}`) : 0n;
      const liquidationThreshold = threshold > 0n ? threshold : collateralFactor;
      // Venus prices are scaled so that amount * price / 1e18 is USD with 18 decimals.
      const supplyUsd = (((vBalance * exchangeRate) / 10n ** 18n) * price) / 10n ** 18n;
      return {
        symbol: String(symbol).replace(/^v/, ''),
        supplyUsd,
        liquidationThreshold,
        borrowUsd: (borrow * price) / 10n ** 18n,
        weightedByFactor: (supplyUsd * collateralFactor) / 10n ** 18n,
      };
    }),
  );
  const borrowUsd = legs.reduce((sum, v) => sum + v.borrowUsd, 0n);
  const weightedByFactor = legs.reduce((sum, v) => sum + v.weightedByFactor, 0n);
  const healthFactor = healthFromLiquidity(borrowUsd, liquidity, shortfall);
  const borrowLimitRatio = borrowUsd > 0n ? Number((weightedByFactor * 1_000_000n) / borrowUsd) / 1_000_000 : null;
  const rows: VenusReading['rows'] = { collateral: {}, debt: {}, prices: {} };
  for (const leg of legs) {
    // Below a cent rounds to nothing and only clutters the question.
    const supplied = usd(leg.supplyUsd);
    const borrowed = usd(leg.borrowUsd);
    if (supplied > 0) rows.collateral[leg.symbol] = { amount: supplied, liqThreshold: Number(leg.liquidationThreshold) / 1e18 };
    if (borrowed > 0) rows.debt[leg.symbol] = borrowed;
    if (supplied > 0 || borrowed > 0) rows.prices[leg.symbol] = 1;
  }
  return { account, healthFactor, borrowLimitRatio, liquidatable: shortfall > 0n, borrowUsd: Number(borrowUsd) / 1e18, block, rows };
}

const SAMPLE_SYMBOLS = ['vUSDT', 'vUSDC', 'vBNB', 'vBTC', 'vETH'];

/**
 * Accounts that borrowed or repaid recently on the main Venus markets and
 * still carry debt: real positions to ask agents about. Searched backwards
 * in 5,000-block windows, which public nodes allow. Activity is sparse, so
 * the result is cached by the caller rather than searched every run.
 */
export async function sampleVenusBorrowers(client: Client, { count = 6, minBorrowUsd = 50, maxWindows = 60 } = {}): Promise<Address[]> {
  const markets = await client.readContract({ address: VENUS_COMPTROLLER, abi: COMPTROLLER_ABI, functionName: 'getAllMarkets' });
  const symbols = await Promise.all(markets.map((m) => client.readContract({ address: m, abi: VTOKEN_ABI, functionName: 'symbol' }).catch(() => '')));
  const sampleMarkets = markets.filter((_, i) => SAMPLE_SYMBOLS.includes(symbols[i]));
  const latest = await client.getBlockNumber();
  const found: Address[] = [];
  const seen = new Set<string>();
  for (let w = 0; w < maxWindows && found.length < count; w += 1) {
    const toBlock = latest - BigInt(w) * 5000n;
    const window = { address: sampleMarkets, fromBlock: toBlock - 4999n, toBlock };
    const [borrows, repays] = await Promise.all([
      client.getLogs({ ...window, event: BORROW_EVENT }).catch(() => []),
      client.getLogs({ ...window, event: REPAY_EVENT }).catch(() => []),
    ]);
    for (const log of [...borrows, ...repays]) {
      const borrower = log.args.borrower;
      if (!borrower || seen.has(borrower.toLowerCase())) continue;
      seen.add(borrower.toLowerCase());
      const reading = await readVenusPosition(client, borrower).catch(() => null);
      if (reading && reading.healthFactor !== null && reading.borrowUsd >= minBorrowUsd) found.push(borrower);
      if (found.length >= count) break;
    }
  }
  return found;
}
