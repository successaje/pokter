import { erc8183Addresses } from '@altananetwork/sdk';
import { createPublicClient, http, formatUnits, formatEther, erc20Abi } from 'viem';
import { bscTestnet } from 'viem/chains';

import { privateKeyToAccount } from 'viem/accounts';

// Derived from the configured admin key, so this always checks the wallet the
// app would actually use rather than a hardcoded address that can go stale.
const WALLET = privateKeyToAccount(
  process.env.ALTANA_ADMIN_KEY as `0x${string}`,
).address;
const { paymentToken } = erc8183Addresses(97);

const RPCS = [
  'https://bsc-testnet-rpc.publicnode.com',
  'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
  'https://data-seed-prebsc-2-s1.bnbchain.org:8545',
  'https://bsc-testnet.drpc.org',
];

console.log(`wallet: ${WALLET}`);
console.log(`$U    : ${paymentToken}\n`);

for (const url of RPCS) {
  try {
    const client = createPublicClient({ chain: bscTestnet, transport: http(url) });
    const [u, native, block] = await Promise.all([
      client.readContract({ address: paymentToken, abi: erc20Abi, functionName: 'balanceOf', args: [WALLET] }),
      client.getBalance({ address: WALLET }),
      client.getBlockNumber(),
    ]);
    console.log(
      `  ${u > 0n ? '>>' : '  '} ${url.replace('https://', '').slice(0, 38).padEnd(39)} block ${block}  $U ${formatUnits(u, 18).padEnd(12)} tBNB ${formatEther(native)}`,
    );
  } catch (error) {
    console.log(`     ${url.replace('https://', '').slice(0, 38).padEnd(39)} ERROR ${(error as Error).message.slice(0, 40)}`);
  }
}
