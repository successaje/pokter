import { createPublicClient, http, formatEther } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

const ADDRESSES = [
  { label: 'persistent (current)', address: '0xAe4473468F10b507AB410077FA266FD8c5Af2196' },
  { label: 'ephemeral (1st spike)', address: '0x7FA8e4a9127552b3e1f80006797194D221B8B4ae' },
] as const;

const ENDPOINTS: { label: string; chain: typeof bsc | typeof bscTestnet; url: string }[] = [
  { label: 'testnet publicnode', chain: bscTestnet, url: 'https://bsc-testnet-rpc.publicnode.com' },
  { label: 'testnet binance-s1', chain: bscTestnet, url: 'https://data-seed-prebsc-1-s1.bnbchain.org:8545' },
  { label: 'testnet binance-s2', chain: bscTestnet, url: 'https://data-seed-prebsc-2-s1.bnbchain.org:8545' },
  { label: 'testnet drpc',       chain: bscTestnet, url: 'https://bsc-testnet.drpc.org' },
  { label: 'MAINNET publicnode', chain: bsc,        url: 'https://bsc-rpc.publicnode.com' },
];

for (const { label: who, address } of ADDRESSES) {
  console.log(`\n${who}: ${address}`);
  for (const { label, chain, url } of ENDPOINTS) {
    try {
      const client = createPublicClient({ chain, transport: http(url) });
      const [balance, nonce] = await Promise.all([
        client.getBalance({ address }),
        client.getTransactionCount({ address }),
      ]);
      const has = balance > 0n;
      console.log(
        `  ${has ? '>>' : '  '} ${label.padEnd(20)} chain=${chain.id} balance=${formatEther(balance)} nonce=${nonce}`,
      );
    } catch (error) {
      console.log(`     ${label.padEnd(20)} ERROR ${(error as Error).message.slice(0, 60)}`);
    }
  }
}
