import { getErc8183Job, BNB_TESTNET } from '@altananetwork/sdk';
const started = Date.now();
for (;;) {
  const j = await getErc8183Job(BNB_TESTNET, 1540n);
  if (['SUBMITTED', 'COMPLETED', 'REJECTED'].includes(j.statusName)) {
    console.log(`DELIVERED after ${Math.round((Date.now()-started)/1000)}s: ${j.statusName}, submittedAt ${new Date(Number(j.submittedAt)*1000).toISOString()}`);
    break;
  }
  if (Date.now() - started > 20 * 60_000) { console.log(`STILL ${j.statusName} after 20 minutes — no deliverable submitted`); break; }
  await new Promise((r) => setTimeout(r, 20_000));
}
