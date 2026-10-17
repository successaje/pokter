import assert from 'node:assert/strict';
import test from 'node:test';

import { withoutClaimedIds } from '../src/lib/erc8183/claimed-ids';
import type { HiredJob } from '../src/lib/erc8183/types';

const row = (id: string, jobId: string, agentTokenId: string, hiredAt: string) => ({ id, jobId, chainId: 97, agentChainId: 97, agentTokenId, hiredAt }) as HiredJob;

test('a phantom row holding another agent’s job id is dropped, the real one kept', () => {
  // 16 October: Rate Router's phantom 1522 was recorded before Yield Keeper created 1522.
  const jobs = [
    row('a', '1521', '2556', '2026-10-16T22:57:00Z'),
    row('phantom', '1522', '2556', '2026-10-16T22:57:30Z'),
    row('real', '1522', '2554', '2026-10-16T22:58:00Z'),
    row('b', '1523', '2554', '2026-10-16T22:58:30Z'),
  ];
  assert.deepEqual(withoutClaimedIds(jobs).map((j) => j.id), ['a', 'real', 'b']);
});

test('the same agent’s rows for one id are both kept (re-records, not phantoms)', () => {
  const jobs = [row('x', '9', '1', '2026-10-16T10:00:00Z'), row('y', '9', '1', '2026-10-16T11:00:00Z')];
  assert.equal(withoutClaimedIds(jobs).length, 2);
});
