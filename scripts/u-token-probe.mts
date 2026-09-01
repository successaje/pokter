import { erc8183Addresses, BNB_TESTNET } from '@altananetwork/sdk';
import { createPublicClient, http, parseUnits, encodeFunctionData, formatUnits, erc20Abi } from 'viem';

const WALLET = '0xAe4473468F10b507AB410077FA266FD8c5Af2196' as const;
const { paymentToken } = erc8183Addresses(97);
const client = createPublicClient({ chain: BNB_TESTNET.chain, transport: http(BNB_TESTNET.publicRpcUrl) });

const [symbol, decimals, supply] = await Promise.all([
  client.readContract({ address: paymentToken, abi: erc20Abi, functionName: 'symbol' }),
  client.readContract({ address: paymentToken, abi: erc20Abi, functionName: 'decimals' }),
  client.readContract({ address: paymentToken, abi: erc20Abi, functionName: 'totalSupply' }),
]);
console.log(`token ${symbol} (${decimals} decimals) at ${paymentToken}`);
console.log(`total supply: ${formatUnits(supply, decimals)}\n`);

// Candidate faucet-ish entry points on a testnet token.
const CANDIDATES = [
  { sig: 'function mint(address,uint256)', args: [WALLET, parseUnits('10', decimals)] },
  { sig: 'function mint(uint256)', args: [parseUnits('10', decimals)] },
  { sig: 'function faucet()', args: [] },
  { sig: 'function faucet(uint256)', args: [parseUnits('10', decimals)] },
  { sig: 'function drip()', args: [] },
  { sig: 'function claim()', args: [] },
] as const;

console.log('simulating candidate mint entry points from the wallet:');
for (const candidate of CANDIDATES) {
  const abi = [
    {
      type: 'function',
      name: candidate.sig.split('(')[0].replace('function ', ''),
      stateMutability: 'nonpayable',
      inputs: candidate.sig
        .slice(candidate.sig.indexOf('(') + 1, -1)
        .split(',')
        .filter(Boolean)
        .map((t, i) => ({ name: `a${i}`, type: t.trim() })),
      outputs: [],
    },
  ] as const;

  try {
    await client.call({
      account: WALLET,
      to: paymentToken,
      data: encodeFunctionData({ abi, functionName: abi[0].name, args: candidate.args as never }),
    });
    console.log(`  OPEN      ${candidate.sig}`);
  } catch (error) {
    const message = (error as Error).message.split('\n')[0].slice(0, 72);
    console.log(`  reverted  ${candidate.sig.padEnd(34)} ${message}`);
  }
}

// Who can mint, if it is ownable?
for (const fn of ['owner', 'minter'] as const) {
  try {
    const value = await client.readContract({
      address: paymentToken,
      abi: [{ type: 'function', name: fn, stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
      functionName: fn,
    });
    console.log(`\n${fn}: ${value}`);
  } catch {
    /* not present */
  }
}
