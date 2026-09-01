import { erc8183Addresses, BNB, BNB_TESTNET } from '@altananetwork/sdk';
import { createPublicClient, http, formatUnits, erc20Abi, type Address } from 'viem';

const V3_FACTORY = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865' as const;
const WBNB_MAINNET = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as const;
const USDT_MAINNET = '0x55d398326f99059fF775485246999027B3197955' as const;
const FEE_TIERS = [100, 500, 2500, 10_000];

const factoryAbi = [
  {
    type: 'function',
    name: 'getPool',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }],
    outputs: [{ type: 'address' }],
  },
] as const;

const counterAbi = [
  { type: 'function', name: 'jobCounter', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

// 1. Is mainnet $U buyable on PancakeSwap V3?
const mainnet = createPublicClient({ chain: BNB.chain, transport: http(BNB.publicRpcUrl) });
const { paymentToken: uMainnet } = erc8183Addresses(56);

console.log(`mainnet $U: ${uMainnet}`);
for (const [label, pair] of [['WBNB', WBNB_MAINNET], ['USDT', USDT_MAINNET]] as const) {
  for (const fee of FEE_TIERS) {
    const pool = (await mainnet.readContract({
      address: V3_FACTORY, abi: factoryAbi, functionName: 'getPool', args: [uMainnet, pair as Address, fee],
    })) as Address;

    if (pool !== '0x0000000000000000000000000000000000000000') {
      const balance = await mainnet.readContract({
        address: uMainnet, abi: erc20Abi, functionName: 'balanceOf', args: [pool],
      });
      console.log(`  POOL  U/${label} fee ${fee}: ${pool} holds ${formatUnits(balance, 18)} U`);
    }
  }
}
console.log('  (no lines above = no PancakeSwap V3 pool for $U)');

// 2. Has anyone used the ERC-8183 escrow on either chain?
for (const network of [BNB_TESTNET, BNB]) {
  const client = createPublicClient({ chain: network.chain, transport: http(network.publicRpcUrl) });
  const { commerce } = erc8183Addresses(network.chainId);
  try {
    const jobs = await client.readContract({ address: commerce, abi: counterAbi, functionName: 'jobCounter' });
    console.log(`\nchain ${network.chainId} jobCounter: ${jobs}`);
  } catch (error) {
    console.log(`\nchain ${network.chainId} jobCounter read failed: ${(error as Error).message.slice(0, 70)}`);
  }
}
