/**
 * TermiX Agent Advantage — Tasks 2 and 3.
 *
 * Each task runs twice: once through a live third-party agent (HeyAnon's
 * ERC-8004 MCP servers) and once from primary sources with no agent involved.
 * Both sides are timed and both outputs are printed verbatim, so the report
 * quotes measurements rather than impressions.
 */
import { createPublicClient, http, formatUnits } from 'viem';
import { bsc } from 'viem/chains';

const SUBJECT = '0x96145D068C49aC0D4325D981F8eae59A41Cf8Bf1' as const;
const COMPTROLLER = '0xfD36E2c2a6789Db23113685031d7F16329158384' as const;

const client = createPublicClient({ chain: bsc, transport: http('https://bsc-rpc.publicnode.com') });

async function callAgent(server: string, name: string, args: unknown) {
  const started = Date.now();
  const response = await fetch(`https://erc8004.heyanon.ai/mcp/${server}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: Date.now(),
      method: 'tools/call', params: { name, arguments: args },
    }),
  });
  const body = await response.json();
  const ms = Date.now() - started;
  const text = body?.result?.content?.[0]?.text ?? JSON.stringify(body?.error ?? body);
  return { ms, text };
}

console.log('════ TASK 2 — Liquidation risk on a live Venus position ════');
console.log(`subject: ${SUBJECT}\n`);

const a2 = await callAgent('venus', 'getAccountLiquidity', {
  chainNames: ['bsc'], pool: 'CORE', userAddress: SUBJECT,
});
console.log(`AGENT   ${a2.ms}ms`);
console.log(`  ${a2.text}\n`);

const m2Started = Date.now();
const liquidity = (await client.readContract({
  address: COMPTROLLER,
  abi: [{
    type: 'function', name: 'getAccountLiquidity', stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
  }],
  functionName: 'getAccountLiquidity',
  args: [SUBJECT],
})) as readonly [bigint, bigint, bigint];
const m2Ms = Date.now() - m2Started;
console.log(`MANUAL  ${m2Ms}ms`);
console.log(`  error=${liquidity[0]} liquidity=$${Number(formatUnits(liquidity[1], 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} shortfall=$${Number(formatUnits(liquidity[2], 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}\n`);

console.log('════ TASK 3 — Borrow cost across chains (trading leg) ════\n');

const a3 = await callAgent('venus', 'getBorrowAPR', {
  aprRequests: [
    { chainName: 'bsc', aprRequestDetails: [{ tokenSymbols: ['USDT', 'USDC'], pool: 'CORE' }] },
    { chainName: 'ethereum', aprRequestDetails: [{ tokenSymbols: ['USDT', 'USDC'], pool: 'CORE' }] },
  ],
});
console.log(`AGENT   ${a3.ms}ms  (2 chains, 4 markets, one call)`);
console.log(`  ${a3.text}\n`);

const m3Started = Date.now();
const vTokenAbi = [
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'borrowRatePerBlock', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

const markets = (await client.readContract({
  address: COMPTROLLER,
  abi: [{ type: 'function', name: 'getAllMarkets', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] }],
  functionName: 'getAllMarkets',
})) as readonly `0x${string}`[];

const syms = await Promise.all(
  markets.map((a) => client.readContract({ address: a, abi: vTokenAbi, functionName: 'symbol' }).catch(() => null)),
);
const wanted = markets
  .map((address, i) => ({ address, symbol: syms[i] as string | null }))
  .filter((m) => m.symbol === 'vUSDT' || m.symbol === 'vUSDC');

const borrowRates = await Promise.all(
  wanted.map((w) => client.readContract({ address: w.address, abi: vTokenAbi, functionName: 'borrowRatePerBlock' })),
);

const latest = await client.getBlock();
const older = await client.getBlock({ blockNumber: latest.number - 1000n });
const blocksPerYear = Math.round((365 * 24 * 3600) / (Number(latest.timestamp - older.timestamp) / 1000));
const m3Ms = Date.now() - m3Started;

console.log(`MANUAL  ${m3Ms}ms  (BSC only — Ethereum needs a second RPC and a second market scan)`);
wanted.forEach((w, i) => {
  const apr = Number(formatUnits(borrowRates[i] as bigint, 18)) * blocksPerYear * 100;
  console.log(`  ${w.symbol} borrow APR ${apr.toFixed(2)}%`);
});
