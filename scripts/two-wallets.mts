import { createPublicClient, http, formatEther, getAddress } from 'viem';
import { bscTestnet } from 'viem/chains';

const U = getAddress('0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565');
const erc20 = [{ name:'balanceOf', type:'function', stateMutability:'view',
  inputs:[{type:'address'}], outputs:[{type:'uint256'}] }] as const;

const client = createPublicClient({ chain: bscTestnet, transport: http() });

for (const [label, addr] of [
  ['old admin  0xAe44…2196', getAddress('0xAe4473468F10b507AB410077FA266FD8c5Af2196')],
  ['current    0x60eF…8e87', getAddress('0x60eF148485C2a5119fa52CA13c52E9fd98F28e87')],
] as const) {
  const [bnb, u] = await Promise.all([
    client.getBalance({ address: addr }),
    client.readContract({ address: U, abi: erc20, functionName: 'balanceOf', args: [addr] }),
  ]);
  console.log(`${label}  tBNB ${Number(formatEther(bnb)).toFixed(4).padStart(8)}   $U ${Number(formatEther(u)).toFixed(1).padStart(6)}`);
}
