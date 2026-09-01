/** Find a real Venus borrower to use as the subject of Tasks 2 and 3. */
import { createPublicClient, http, parseAbiItem } from 'viem';
import { bsc } from 'viem/chains';

const VUSDT = '0xfD5840Cd36d94D7229439859C0112a4185BC0255' as const;
const client = createPublicClient({ chain: bsc, transport: http('https://bsc-rpc.publicnode.com') });

const latest = await client.getBlockNumber();
const logs = await client.getLogs({
  address: VUSDT,
  event: parseAbiItem('event Borrow(address borrower, uint256 borrowAmount, uint256 accountBorrows, uint256 totalBorrows)'),
  fromBlock: latest - 400n,
  toBlock: latest,
});

console.log(`${logs.length} recent Borrow events on vUSDT`);
const seen = new Set<string>();
for (const log of logs) {
  const borrower = log.args.borrower as string;
  if (seen.has(borrower)) continue;
  seen.add(borrower);
  console.log(`  ${borrower}  accountBorrows=${log.args.accountBorrows}`);
  if (seen.size >= 5) break;
}
