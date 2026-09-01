import { getErc8183Job, BNB_TESTNET } from '@altananetwork/sdk';

console.log('recent testnet jobs (are others funding successfully?)\n');
for (let id = 864n; id >= 845n; id -= 1n) {
  try {
    const job = await getErc8183Job(BNB_TESTNET, id);
    const funded = job.status >= 1 && job.status !== 5;
    console.log(
      `  #${String(job.id).padEnd(4)} ${job.statusName.padEnd(10)} budget ${String(job.budget).padEnd(20)} ${funded ? '' : '<- never funded'}`,
    );
  } catch {
    console.log(`  #${id} unreadable`);
  }
}
