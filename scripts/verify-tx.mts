import { createPublicClient, http } from 'viem';
import { bscTestnet } from 'viem/chains';

const client = createPublicClient({ chain: bscTestnet, transport: http() });
const hash = process.argv[2] as `0x${string}`;

const r = await client.getTransactionReceipt({ hash });
const tx = await client.getTransaction({ hash });
console.log('  status      :', r.status);
console.log('  block       :', r.blockNumber.toString());
console.log('  from        :', tx.from);
console.log('  gas used    :', r.gasUsed.toString());
console.log('  logs        :', r.logs.length);
console.log('  explorer    : https://testnet.bscscan.com/tx/' + hash);
