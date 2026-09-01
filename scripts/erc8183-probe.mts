import { ERC8183_ADDRESSES, erc8183Addresses, BNB_TESTNET, BNB } from '@altananetwork/sdk';
import { createPublicClient, http, formatUnits, erc20Abi } from 'viem';

console.log('=== chains with an ERC-8183 deployment ===');
for (const [chainId, addresses] of Object.entries(ERC8183_ADDRESSES)) {
  console.log(`\nchain ${chainId}`);
  for (const [name, address] of Object.entries(addresses)) {
    console.log(`  ${name.padEnd(14)} ${address}`);
  }
}

const WALLET = '0xAe4473468F10b507AB410077FA266FD8c5Af2196' as const;

for (const network of [BNB_TESTNET, BNB]) {
  let addresses;
  try {
    addresses = erc8183Addresses(network.chainId);
  } catch (error) {
    console.log(`\nchain ${network.chainId}: no deployment — ${(error as Error).message.slice(0, 60)}`);
    continue;
  }

  const client = createPublicClient({ chain: network.chain, transport: http(network.publicRpcUrl) });
  console.log(`\n=== chain ${network.chainId} live checks ===`);

  for (const [label, address] of [
    ['commerce', addresses.commerce],
    ['router', addresses.router],
    ['policy', addresses.policy],
    ['paymentToken ($U)', addresses.paymentToken],
  ] as const) {
    const code = await client.getCode({ address });
    console.log(`  ${label.padEnd(18)} ${address} ${code && code !== '0x' ? 'CONTRACT' : 'NO CODE'}`);
  }

  try {
    const [symbol, decimals, balance] = await Promise.all([
      client.readContract({ address: addresses.paymentToken, abi: erc20Abi, functionName: 'symbol' }),
      client.readContract({ address: addresses.paymentToken, abi: erc20Abi, functionName: 'decimals' }),
      client.readContract({ address: addresses.paymentToken, abi: erc20Abi, functionName: 'balanceOf', args: [WALLET] }),
    ]);
    console.log(`  wallet holds       ${formatUnits(balance, decimals)} ${symbol}`);
  } catch (error) {
    console.log(`  payment token read failed: ${(error as Error).message.slice(0, 80)}`);
  }
}
