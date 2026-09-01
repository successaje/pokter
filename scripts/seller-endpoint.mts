import { getErc8183DeliverableUrl, getErc8183Job, BNB_TESTNET } from '@altananetwork/sdk';

for (const id of [863n, 859n, 852n]) {
  const job = await getErc8183Job(BNB_TESTNET, id);
  if (job.provider.toLowerCase() !== '0xda61dfa428bb0b04ae6bfc6d3e5f65360592fd7e') continue;
  console.log(`job #${id} ${job.statusName}`);
  try {
    const url = await getErc8183DeliverableUrl(BNB_TESTNET, id, { scanWindow: 2000n, maxWindows: 6 });
    console.log(`  deliverable: ${url ?? '(not found in scanned window)'}`);
    if (url) break;
  } catch (error) {
    console.log(`  lookup failed: ${(error as Error).message.slice(0, 90)}`);
  }
}
