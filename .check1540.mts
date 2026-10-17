import { getErc8183Job, BNB_TESTNET } from '@altananetwork/sdk';
const j = await getErc8183Job(BNB_TESTNET, 1540n);
console.log('status      :', j.statusName);
console.log('submittedAt :', Number(j.submittedAt) || '(never)');
console.log('provider    :', j.provider);
console.log('expires     :', new Date(Number(j.expiredAt) * 1000).toISOString());
console.log('now         :', new Date().toISOString());
