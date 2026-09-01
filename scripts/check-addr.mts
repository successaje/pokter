import { BNB_TESTNET, BNB } from '@altananetwork/sdk';
import { createPublicClient, http } from 'viem';

const CANDIDATES: Record<string, `0x${string}`> = {
  'V3 SwapRouter (claimed)': '0x9a489505a00cE272eAa5e07Dba6491314CaE3796',
  'V3 PositionManager (claimed)': '0x427bF5b37357632377eCbEC9de3626C71A5396c1',
  'V3 Factory (claimed)': '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  'V2 Router (claimed)': '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',
};

for (const [label, cfg] of [['testnet', BNB_TESTNET], ['mainnet', BNB]] as const) {
  const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.publicRpcUrl) });
  console.log(`\n=== ${label} (chain ${cfg.chainId}) via ${cfg.publicRpcUrl} ===`);
  for (const [name, address] of Object.entries(CANDIDATES)) {
    try {
      const code = await client.getCode({ address });
      const size = code && code !== '0x' ? (code.length - 2) / 2 : 0;
      console.log(`  ${size > 0 ? 'CONTRACT' : 'no code '}  ${name.padEnd(30)} ${address} ${size ? `(${size}b)` : ''}`);
    } catch (e) {
      console.log(`  ERROR     ${name}: ${(e as Error).message.slice(0, 60)}`);
    }
  }
}
