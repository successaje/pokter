import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { HiredJob } from '../../src/lib/erc8183/types';

/*
 * The escrow index behind agents' records, against a stand-in chain: it
 * reaches back to job 1, re-reads the jobs that can still move, keeps one
 * wallet row per agent, and the campaign tracker still counts only its
 * window. Server conditions, because the stores are `server-only`.
 */

const dir = mkdtempSync(join(tmpdir(), 'pokter-escrow-index-'));
process.env.QUEST_DB_PATH = join(dir, 'quest.db');
process.env.JOB_DB_PATH = join(dir, 'jobs.db');

const { indexEscrowJobs, backfillEscrowJobs, refreshEscrowStatuses } = await import('../../src/lib/quest/indexer');
const { getQuestStore } = await import('../../src/lib/quest/store');
const { getJobStore } = await import('../../src/lib/erc8183/store');
const { agentRecordJobs } = await import('../../src/lib/agent/record-jobs');
const { inCampaignWindow } = await import('../../src/lib/quest/lookup');

const W1 = '0x00000000000000000000000000000000000000a1';
const SHARED = '0x00000000000000000000000000000000000000a2';
const STRANGER = '0x00000000000000000000000000000000000000ff';
const ZERO = '0x0000000000000000000000000000000000000000';
const NOW = Date.now();
const s = (ms: number) => BigInt(Math.floor(ms / 1000));
const SEPTEMBER = Date.parse('2026-09-15T00:00:00Z');

type Job = { client: string; provider: string; status: number; expiredAt: bigint; submittedAt: bigint };
/* Jobs 1–5 fell before the campaign opened; 6–10 after. */
const chain: Record<number, Job> = {
  1: { client: STRANGER, provider: W1, status: 3, expiredAt: s(SEPTEMBER), submittedAt: s(SEPTEMBER - 60_000) },
  2: { client: STRANGER, provider: SHARED, status: 3, expiredAt: s(SEPTEMBER), submittedAt: s(SEPTEMBER - 60_000) },
  3: { client: STRANGER, provider: STRANGER, status: 0, expiredAt: s(SEPTEMBER), submittedAt: 0n },
  4: { client: STRANGER, provider: STRANGER, status: 0, expiredAt: s(SEPTEMBER), submittedAt: 0n },
  5: { client: STRANGER, provider: STRANGER, status: 0, expiredAt: s(SEPTEMBER), submittedAt: 0n },
  /* Open, and its deadline already passed when it was read: never funded. */
  6: { client: STRANGER, provider: W1, status: 0, expiredAt: s(NOW - 3_600_000), submittedAt: 0n },
  7: { client: '0x00000000000000000000000000000000000000c7', provider: W1, status: 3, expiredAt: s(NOW + 3_600_000), submittedAt: s(NOW - 60_000) },
  /* Read open between creation and funding; funded, delivered and paid after. */
  8: { client: '0x00000000000000000000000000000000000000c8', provider: W1, status: 0, expiredAt: s(NOW + 3_600_000), submittedAt: 0n },
  9: { client: STRANGER, provider: STRANGER, status: 0, expiredAt: s(NOW + 3_600_000), submittedAt: 0n },
  10: { client: '0x00000000000000000000000000000000000000ca', provider: W1, status: 1, expiredAt: s(NOW + 3_600_000), submittedAt: 0n },
};

const reads: number[] = [];
const reader = {
  readContract: async ({ functionName, args }: { functionName: string; args?: readonly bigint[] }) => {
    if (functionName === 'jobCounter') return 10n;
    const id = Number(args![0]);
    if (functionName === 'jobPaymentToken') return ZERO;
    reads.push(id);
    const j = chain[id];
    return { id: BigInt(id), client: j.client, provider: j.provider, evaluator: ZERO, description: '', budget: 10n ** 16n, expiredAt: j.expiredAt, status: j.status, hook: ZERO, submittedAt: j.submittedAt, deliverable: `0x${'0'.repeat(64)}` };
  },
} as never;

test('the index starts at the campaign, then reaches back to job 1 without losing its place', async () => {
  const forward = await indexEscrowJobs(97, { client: reader });
  assert.deepEqual(forward, { chainId: 97, indexed: 5, nextJob: 11, counter: 10, caughtUp: true });
  assert.equal(getQuestStore().cursor(97)?.firstJob, 6);

  const back = await backfillEscrowJobs(97, { client: reader, maxBatches: 5 });
  assert.deepEqual(back, { chainId: 97, indexed: 5, firstJob: 1, complete: true });
  assert.deepEqual({ ...getQuestStore().cursor(97), updatedAt: null }, { chainId: 97, firstJob: 1, nextJob: 11, updatedAt: null });
  assert.deepEqual((await backfillEscrowJobs(97, { client: reader })).indexed, 0, 'nothing left to read');

  /* The campaign tracker counts the window it always counted. */
  assert.deepEqual(inCampaignWindow(getQuestStore().byClient(STRANGER)).map((job) => job.jobId), [6, 9]);
});

test('one wallet row per agent, so a shared wallet names every agent on it', () => {
  const store = getQuestStore();
  store.saveAgentWallets([
    { wallet: W1, chainId: 97, tokenId: '1', name: 'One' },
    { wallet: SHARED, chainId: 97, tokenId: '2', name: 'Two' },
    { wallet: SHARED, chainId: 97, tokenId: '3', name: 'Three' },
  ]);
  assert.equal(store.allAgentWallets().length, 3);
  assert.deepEqual(store.agentsOnWallet(97, SHARED.toUpperCase().replace('0X', '0x')).map((a) => a.tokenId).sort(), ['2', '3']);
  assert.equal(store.walletOf(97, '1'), W1);
  assert.equal(store.walletOf(56, '1'), null);
});

test('agents’ jobs that can still move are read again, hourly, and nobody else’s', async () => {
  chain[8] = { ...chain[8], status: 3, submittedAt: s(NOW + 600_000) };
  chain[10] = { ...chain[10], status: 2, submittedAt: s(NOW + 600_000) };
  reads.length = 0;
  const later = () => NOW + 2 * 3_600_000;
  const first = await refreshEscrowStatuses({ clients: { 56: reader, 97: reader }, now: later });
  assert.deepEqual(reads.sort((a, b) => a - b), [8, 10], 'open before its deadline, and funded; not 6, open past it, nor 9, a stranger’s');
  assert.deepEqual(first, { read: 2, changed: 2, failed: 0 });
  const rows = new Map(getQuestStore().byProvider(97, W1).map((job) => [job.jobId, job]));
  assert.equal(rows.get(8)?.status, 3);
  assert.equal(rows.get(10)?.status, 2);

  reads.length = 0;
  await refreshEscrowStatuses({ clients: { 56: reader, 97: reader }, now: () => later() + 60_000 });
  assert.deepEqual(reads, [], 'within the hour nothing is read twice');
  await refreshEscrowStatuses({ clients: { 56: reader, 97: reader }, now: () => later() + 3_660_000 });
  assert.deepEqual(reads, [10], 'an hour on, the delivered job awaiting settlement is; settled 8 is not read again');
});

test('an agent’s record is Pokter’s jobs and its wallet’s others, each once; a shared wallet’s are said, not counted', () => {
  const pokter: HiredJob = {
    id: '97:10', jobId: '10', chainId: 97, isTestnet: true, agentChainId: 97, agentTokenId: '1', agentName: 'One',
    provider: W1 as `0x${string}`, client: '0x00000000000000000000000000000000000000ca', task: 'brief', budgetRaw: '10000000000000000',
    expiredAt: new Date(NOW + 3_600_000).toISOString(), hiredAt: new Date(NOW).toISOString(), hireTxHash: null, status: 'SUBMITTED',
    statusCheckedAt: new Date(NOW).toISOString(), deliverableUrl: null, settleTxHash: null,
  };
  getJobStore().record(pokter);

  const one = agentRecordJobs({ chain_id: 97, token_id: '1', name: 'One', agent_wallet: null });
  assert.deepEqual(one.jobs.map((job) => [job.jobId, job.origin ?? 'pokter']).sort(), [['1', 'elsewhere'], ['10', 'pokter'], ['7', 'elsewhere'], ['8', 'elsewhere']]);
  assert.deepEqual(one.elsewhere, { counted: 3, pokterOutsideFlow: 0, selfPaid: 0, shared: null });

  const two = agentRecordJobs({ chain_id: 97, token_id: '2', name: 'Two', agent_wallet: null });
  assert.deepEqual(two.jobs, []);
  assert.deepEqual(two.elsewhere, { counted: 0, pokterOutsideFlow: 0, selfPaid: 0, shared: { jobs: 1, agents: 2 } });

  /* A wallet the sweep has not read yet: the listing's, shared or not by what the table knows. */
  const fresh = agentRecordJobs({ chain_id: 97, token_id: '4', name: 'Four', agent_wallet: SHARED });
  assert.deepEqual(fresh.elsewhere.shared, { jobs: 1, agents: 3 });
});
