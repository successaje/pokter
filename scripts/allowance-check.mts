import { erc8183Addresses, BNB_TESTNET } from '@altananetwork/sdk';
import { createPublicClient, http, formatUnits, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const a = erc8183Addresses(97);
const wallet = privateKeyToAccount(process.env.ALTANA_ADMIN_KEY as `0x${string}`).address;
const rpc = createPublicClient({ chain: BNB_TESTNET.chain, transport: http(BNB_TESTNET.publicRpcUrl) });

for (const [label, spender] of [
  ['commerce', a.commerce],
  ['router', a.router],
  ['policy', a.policy],
] as const) {
  const allowance = await rpc.readContract({
    address: a.paymentToken, abi: erc20Abi, functionName: 'allowance', args: [wallet, spender],
  });
  console.log(`allowance -> ${label.padEnd(9)} ${formatUnits(allowance, 18)} $U`);
}

const balance = await rpc.readContract({
  address: a.paymentToken, abi: erc20Abi, functionName: 'balanceOf', args: [wallet],
});
console.log(`\nwallet $U balance: ${formatUnits(balance, 18)}`);

// Did the completed job register a policy?
for (const jobId of [863n, 864n]) {
  const policy = await rpc.readContract({
    address: a.router,
    abi: [{ type: 'function', name: 'jobPolicy', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] }],
    functionName: 'jobPolicy', args: [jobId],
  });
  console.log(`router.jobPolicy(${jobId}) = ${policy}`);
}
