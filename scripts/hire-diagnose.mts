import {
  createClient,
  signerFromPrivateKey,
  BNB_TESTNET,
  erc8183Addresses,
  buildHireCalls,
} from '@altananetwork/sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatUnits, parseUnits, erc20Abi } from 'viem';

const key = process.env.ALTANA_ADMIN_KEY as `0x${string}`;
const eoa = privateKeyToAccount(key).address;
const addresses = erc8183Addresses(97);
const rpc = createPublicClient({ chain: BNB_TESTNET.chain, transport: http(BNB_TESTNET.publicRpcUrl) });

const client = createClient({ chains: [BNB_TESTNET] });
const wallet = await client.createWallet({ signer: signerFromPrivateKey(key) });

console.log(`admin EOA      : ${eoa}`);
console.log(`smart account  : ${wallet.address}`);
console.log(`same address?  : ${eoa.toLowerCase() === wallet.address.toLowerCase()}\n`);

for (const [label, addr] of [['EOA', eoa], ['smart account', wallet.address]] as const) {
  const [u, native] = await Promise.all([
    rpc.readContract({ address: addresses.paymentToken, abi: erc20Abi, functionName: 'balanceOf', args: [addr] }),
    rpc.getBalance({ address: addr }),
  ]);
  console.log(`${label.padEnd(14)} $U ${formatUnits(u, 18).padEnd(10)} tBNB ${formatUnits(native, 18)}`);
}

const allowance = await rpc.readContract({
  address: addresses.paymentToken, abi: erc20Abi, functionName: 'allowance',
  args: [wallet.address, addresses.commerce],
});
console.log(`\nallowance to commerce: ${formatUnits(allowance, 18)} $U`);

const jobCounter = (await rpc.readContract({
  address: addresses.commerce,
  abi: [{ type: 'function', name: 'jobCounter', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
  functionName: 'jobCounter',
})) as bigint;
console.log(`jobCounter: ${jobCounter} -> predicted jobId ${jobCounter + 1n}`);

// Simulate each batched call from the smart account to find the failing one.
const calls = buildHireCalls({
  addresses,
  jobId: jobCounter + 1n,
  provider: '0xdA61DfA428Bb0B04AE6BfC6D3E5F65360592fD7E',
  description: 'diagnostic',
  budget: parseUnits('0.1', 18),
  expiredAt: BigInt(Math.floor(Date.now() / 1000) + 7200),
});

console.log(`\nbatched calls: ${calls.length}`);
for (const [index, call] of calls.entries()) {
  try {
    await rpc.call({ account: wallet.address, to: call.to, data: call.data, value: call.value });
    console.log(`  ${index + 1}. ok       to ${call.to} selector ${call.data?.slice(0, 10)}`);
  } catch (error) {
    const msg = (error as Error).message.split('\n').filter(Boolean).slice(0, 3).join(' | ');
    console.log(`  ${index + 1}. REVERTS  to ${call.to} selector ${call.data?.slice(0, 10)}`);
    console.log(`     ${msg.slice(0, 200)}`);
  }
}
