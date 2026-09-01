/**
 * Does the manual path contain a correctness trap?
 *
 * Venus annualises a per-block rate. Most documentation and older tutorials use
 * 10,512,000 blocks/year, which assumes BSC's original 3-second blocks. If the
 * chain now produces blocks faster, an analyst copying that constant gets a
 * silently wrong APR — no error, just a wrong number.
 */
import { createPublicClient, http, formatUnits } from 'viem';
import { bsc } from 'viem/chains';

const client = createPublicClient({ chain: bsc, transport: http('https://bsc-rpc.publicnode.com') });
const VUSDT = '0xfD5840Cd36d94D7229439859C0112a4185BC0255' as const;

const rate = (await client.readContract({
  address: VUSDT,
  abi: [{ type: 'function', name: 'supplyRatePerBlock', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
  functionName: 'supplyRatePerBlock',
})) as bigint;

const latest = await client.getBlock();
const older = await client.getBlock({ blockNumber: latest.number - 1000n });
const blockSeconds = Number(latest.timestamp - older.timestamp) / 1000;
const measured = Math.round((365 * 24 * 3600) / blockSeconds);

const LEGACY = 10_512_000; // the widely-copied 3-second-block constant
const perBlock = Number(formatUnits(rate, 18));

console.log(`measured block time : ${blockSeconds.toFixed(3)}s`);
console.log(`measured blocks/year: ${measured.toLocaleString()}`);
console.log(`legacy  blocks/year : ${LEGACY.toLocaleString()}\n`);
console.log(`vUSDT supply APR, measured constant : ${(perBlock * measured * 100).toFixed(2)}%`);
console.log(`vUSDT supply APR, legacy constant   : ${(perBlock * LEGACY * 100).toFixed(2)}%`);
console.log(`\nunderstatement factor: ${(measured / LEGACY).toFixed(2)}x`);
console.log(`agent answered       : 2.83%`);
