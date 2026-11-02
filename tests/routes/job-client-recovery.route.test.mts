import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { HiredJob } from '../../src/lib/erc8183/types';

test('a chain-verified funder makes a legacy job visible on the buyer’s next device', async () => {
  const { openJobStore } = await import('../../src/lib/erc8183/store');
  const store = openJobStore(join(mkdtempSync(join(tmpdir(), 'pokter-client-recovery-')), 'jobs.db'));
  const buyer = '0x89D29fbf9F3B6E727530231438f80d556ff2d905';
  const job: HiredJob = {
    id: 'legacy-uuid', jobId: '56995', chainId: 56, isTestnet: false,
    agentChainId: 56, agentTokenId: '2618', agentName: 'Recovered agent',
    provider: '0x93847647d7eb72a69E162117df6a8697dF53EDda',
    task: 'A brief only the funding device saw', budgetRaw: '100000000000000000',
    expiredAt: '2026-10-15T16:10:33.000Z', hiredAt: '2026-10-01T10:00:00.000Z',
    hireTxHash: null, status: 'FUNDED', statusCheckedAt: '2026-10-01T10:00:00.000Z',
    deliverableUrl: null, settleTxHash: null,
  };
  store.record(job);
  assert.deepEqual(store.byClient(buyer), []);
  assert.equal(store.setChainClient(56, '56995', buyer, 'The public task carried on chain'), 1);
  assert.deepEqual(store.byClient(buyer).map((row) => row.id), ['legacy-uuid']);
  assert.equal(store.byId('legacy-uuid')?.task, 'The public task carried on chain', 'the private brief is not exposed by the public wallet lookup');
  assert.equal(store.setChainClient(97, '56995', buyer, 'The public task carried on chain'), 0, 'the same number on another escrow is untouched');
});
