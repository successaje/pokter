/**
 * MANUAL baseline for Task 1: Venus supply APR, computed from primary sources.
 *
 * No agent involved. Reads the Comptroller for the market list, resolves each
 * vToken's symbol, reads supplyRatePerBlock, and annualises it — the same path
 * an analyst would take with a block explorer and a calculator.
 */
import { createPublicClient, http, formatUnits } from 'viem';
import { bsc } from 'viem/chains';

const COMPTROLLER = '0xfD36E2c2a6789Db23113685031d7F16329158384' as const;
const WANTED = new Set(['vUSDT', 'vUSDC', 'vBTC']);

const client = createPublicClient({
  chain: bsc,
  transport: http('https://bsc-rpc.publicnode.com'),
});

const started = Date.now();
const step = (label: string) =>
  console.log(`  [+${((Date.now() - started) / 1000).toFixed(2)}s] ${label}`);

const comptrollerAbi = [
  { type: 'function', name: 'getAllMarkets', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] },
] as const;

const vTokenAbi = [
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'supplyRatePerBlock', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

step('reading Comptroller.getAllMarkets()');
const markets = (await client.readContract({
  address: COMPTROLLER, abi: comptrollerAbi, functionName: 'getAllMarkets',
})) as readonly `0x${string}`[];
step(`${markets.length} markets returned`);

step('resolving vToken symbols');
const symbols = await Promise.all(
  markets.map((address) =>
    client.readContract({ address, abi: vTokenAbi, functionName: 'symbol' }).catch(() => null),
  ),
);

const targets = markets
  .map((address, i) => ({ address, symbol: symbols[i] as string | null }))
  .filter((m) => m.symbol && WANTED.has(m.symbol));
step(`matched ${targets.length} target markets`);

step('reading supplyRatePerBlock for each');
const rates = await Promise.all(
  targets.map((t) =>
    client.readContract({ address: t.address, abi: vTokenAbi, functionName: 'supplyRatePerBlock' }),
  ),
);

// Venus annualises per-block rates. BSC block time is measured here rather than
// assumed, because the chain's cadence has changed and a stale constant is the
// classic way this calculation goes silently wrong.
step('measuring BSC block time from recent blocks');
const latest = await client.getBlock();
const older = await client.getBlock({ blockNumber: latest.number - 1000n });
const blockSeconds = Number(latest.timestamp - older.timestamp) / 1000;
const blocksPerYear = Math.round((365 * 24 * 3600) / blockSeconds);
step(`block time ${blockSeconds.toFixed(2)}s -> ${blocksPerYear.toLocaleString()} blocks/year`);

console.log('\nMANUAL RESULT');
targets.forEach((t, i) => {
  const apr = Number(formatUnits(rates[i] as bigint, 18)) * blocksPerYear * 100;
  console.log(`  ${t.symbol.padEnd(7)} ${apr.toFixed(2)}%   (${t.address})`);
});

console.log(`\nelapsed: ${((Date.now() - started) / 1000).toFixed(2)}s`);
