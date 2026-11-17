import assert from 'node:assert/strict';
import test from 'node:test';

import { teamFundedNote } from '../src/features/agents/paid-note';
import { summariseEconomicHistory } from '../src/lib/erc8183/economic-history';
import type { HiredJob } from '../src/lib/erc8183/types';

/*
 * A card's settled count says only the exception: work Pokter paid for
 * itself. Outside buyers' work needs no line of its own.
 */

test('a card says when Pokter funded some or all of the settled jobs, and nothing otherwise', () => {
  assert.equal(teamFundedNote({ completed: 9, teamCompleted: 0 }), null, 'all bought by others: the count speaks for itself');
  assert.equal(teamFundedNote({ completed: 0, teamCompleted: 0 }), null);
  assert.equal(teamFundedNote({ completed: 9, teamCompleted: 1 }), '1 funded by Pokter');
  assert.equal(teamFundedNote({ completed: 3, teamCompleted: 3 }), 'all funded by Pokter');
  assert.equal(teamFundedNote({ completed: 1, teamCompleted: 1 }), 'funded by Pokter');
});

const TEAM = '0x93847647d7eb72a69E162117df6a8697dF53EDda';
function job(jobId: string, client: string | undefined, status: HiredJob['status']): HiredJob {
  return {
    id: `97:${jobId}`, jobId, chainId: 97, isTestnet: true, agentTokenId: '1', agentName: 'A',
    provider: '0x00000000000000000000000000000000000000a1', client: client as HiredJob['client'], task: '', budgetRaw: '1',
    expiredAt: '2026-11-01T00:00:00.000Z', hiredAt: '2026-10-31T00:00:00.000Z', hireTxHash: null, status,
    statusCheckedAt: '2026-11-01T00:00:00.000Z', deliverableUrl: null, settleTxHash: null,
  };
}

test('the record counts settled jobs Pokter funded, an unknown funder among them, and no others', () => {
  const history = summariseEconomicHistory([
    job('1', TEAM, 'COMPLETED'),
    job('2', undefined, 'COMPLETED'),
    job('3', '0x00000000000000000000000000000000000000b2', 'COMPLETED'),
    job('4', TEAM, 'EXPIRED'),
  ], Date.parse('2026-11-17T00:00:00Z'));
  assert.equal(history.completed, 3);
  assert.equal(history.teamCompleted, 2);
  assert.equal(teamFundedNote(history), '2 funded by Pokter');
});
