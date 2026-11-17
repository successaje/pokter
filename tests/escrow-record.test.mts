import assert from 'node:assert/strict';
import test from 'node:test';

import { elsewhereJob, escrowRecord, originNote } from '../src/lib/agent/escrow-record';
import { summariseEconomicHistory } from '../src/lib/erc8183/economic-history';
import type { HiredJob } from '../src/lib/erc8183/types';
import type { EscrowJob } from '../src/lib/quest/store';

/*
 * An agent's record is its work on the escrow, wherever it was hired. Built
 * from the shape of one testnet agent's record: one job Pokter's team
 * bought, four bought elsewhere by three wallets, one never funded.
 */

const WALLET = '0xedeaa0714213eccab5ab9cf602eafe4f7a741b3c';
const TEAM = '0x93847647d7eb72a69e162117df6a8697df53edda';
const AGENT = { chainId: 97, tokenId: '2718', name: 'Keeper' };
const T = Date.parse('2026-11-04T12:00:00Z') / 1000;

function row(jobId: number, client: string, status: number, over: Partial<EscrowJob> = {}): EscrowJob {
  return {
    chainId: 97, jobId, client, provider: WALLET, budget: '10000000000000000', expiredAt: T + 3_600, status,
    description: '{"task":"a stranger’s words"}', paymentToken: '0xc70b8741b8b07a6d61e54fd4b20f22fa648e5565',
    submittedAt: status >= 2 && status <= 4 ? T + 60 : 0, statusReadAt: '2026-11-17T09:00:00.000Z', ...over,
  };
}

const pokterJob: HiredJob = {
  id: '97:1698', jobId: '1698', chainId: 97, isTestnet: true, agentChainId: 97, agentTokenId: '2718', agentName: 'Keeper',
  provider: WALLET as `0x${string}`, client: TEAM as `0x${string}`, task: 'brief', budgetRaw: '10000000000000000', expiredAt: '2026-11-04T00:00:00.000Z',
  hiredAt: '2026-11-03T19:40:00.000Z', hireTxHash: null, status: 'COMPLETED', statusCheckedAt: '2026-11-17T09:00:00.000Z', deliverableUrl: null, settleTxHash: null,
};

const escrow = [
  row(1698, TEAM, 3),
  row(1699, '0x00000000000000000000000000000000000000b8', 3),
  row(1702, '0x0000000000000000000000000000000000007709', 3),
  row(1703, '0x0000000000000000000000000000000000007709', 3),
  row(1705, '0x000000000000000000000000000000000000863b', 0),
  row(1706, '0x000000000000000000000000000000000000863b', 3),
  /* Funded, deadline passed, nothing delivered: a miss, wherever it was hired. */
  row(1710, '0x000000000000000000000000000000000000aaaa', 1, { expiredAt: T - 60 }),
  /* The wallet paying itself. */
  row(1711, WALLET, 3),
  /* Another chain's escrow: not this registration's work. */
  row(57000, '0x000000000000000000000000000000000000bbbb', 3, { chainId: 56 }),
];

const knownToPokter = (chainId: number, jobId: string) => chainId === 97 && jobId === '1698';
const team = new Set([TEAM]);

test('jobs hired elsewhere join Pokter’s, each once, and only funded work another wallet paid for', () => {
  const record = escrowRecord({ agent: AGENT, pokter: [pokterJob], wallet: WALLET, escrow, agentsOnWallet: 1, knownToPokter, team });
  assert.deepEqual(record.jobs.map((job) => [job.jobId, job.origin ?? 'pokter']), [
    ['1698', 'pokter'], ['1699', 'elsewhere'], ['1702', 'elsewhere'], ['1703', 'elsewhere'], ['1706', 'elsewhere'], ['1710', 'elsewhere'],
  ]);
  assert.deepEqual(record.elsewhere, { counted: 5, unindexed: 0, selfPaid: 1, shared: null });

  /* The same summary Pokter's own jobs go through: deliveries, misses and buyers by its rules. */
  const history = summariseEconomicHistory(record.jobs, T * 1000 + 7_200_000);
  assert.equal(history.jobs, 6);
  assert.equal(history.delivered, 5);
  assert.equal(history.missed, 1, 'a deadline missed elsewhere is a miss');
  assert.equal(history.outsideTeam.uniqueBuyers, 4, 'Pokter’s team wallet is not an outside buyer');
  assert.equal(originNote(history.jobs, record.elsewhere), '1 through Pokter, 5 elsewhere · 1 it paid itself elsewhere, not counted');
});

test('a wallet several agents share is counted for none of them, and said beside the record', () => {
  const record = escrowRecord({ agent: AGENT, pokter: [pokterJob], wallet: WALLET, escrow, agentsOnWallet: 3, knownToPokter, team });
  assert.deepEqual(record.jobs, [pokterJob]);
  assert.deepEqual(record.elsewhere, { counted: 0, unindexed: 0, selfPaid: 1, shared: { jobs: 5, agents: 3 } });
  assert.equal(originNote(1, record.elsewhere), '5 more on a wallet 3 agents share, not counted · 1 it paid itself elsewhere, not counted');
});

test('no wallet, or nothing elsewhere, leaves the record as Pokter’s and says nothing', () => {
  assert.deepEqual(escrowRecord({ agent: AGENT, pokter: [pokterJob], wallet: null, escrow, agentsOnWallet: 1, knownToPokter, team }).jobs, [pokterJob]);
  const own = escrowRecord({ agent: AGENT, pokter: [pokterJob], wallet: WALLET, escrow: [row(1698, TEAM, 3)], agentsOnWallet: 1, knownToPokter, team });
  assert.equal(originNote(1, own.elsewhere), null);
});

test('a job Pokter’s own wallet funded and its index never recorded is Pokter’s, counted, and never called elsewhere', () => {
  /* A paid check: funded by the operator key, and nothing delivered. */
  const check = row(1460, TEAM, 5, { expiredAt: T - 60 });
  const record = escrowRecord({ agent: AGENT, pokter: [pokterJob], wallet: WALLET, escrow: [check], agentsOnWallet: 1, knownToPokter, team });
  assert.deepEqual(record.jobs.map((job) => [job.jobId, job.origin ?? 'pokter']), [['1698', 'pokter'], ['1460', 'unindexed']]);
  assert.deepEqual(record.elsewhere, { counted: 0, unindexed: 1, selfPaid: 0, shared: null });
  assert.equal(originNote(2, record.elsewhere), null, 'both came through Pokter');
  const history = summariseEconomicHistory(record.jobs, T * 1000);
  assert.equal(history.missed, 1, 'the agent’s wallet owed it, so the miss is the agent’s, as for any team hire');
  assert.equal(history.outsideTeam.jobs, 0);
});

test('a job made elsewhere carries the escrow’s facts and none of the stranger’s words, dated by what is known', () => {
  const delivered = elsewhereJob(row(1699, '0x00000000000000000000000000000000000000b8', 3), AGENT)!;
  assert.equal(delivered.origin, 'elsewhere');
  assert.equal(delivered.task, '');
  assert.equal(delivered.status, 'COMPLETED');
  assert.equal(delivered.submittedAt, new Date((T + 60) * 1000).toISOString());
  assert.equal(delivered.hiredAt, delivered.submittedAt, 'ordered by its delivery, the only time Pokter has');
  const missed = elsewhereJob(row(1710, '0x000000000000000000000000000000000000aaaa', 1, { expiredAt: T - 60 }), AGENT)!;
  assert.equal(missed.submittedAt, null);
  assert.equal(missed.hiredAt, new Date((T - 60) * 1000).toISOString(), 'or by its deadline');
  assert.equal(elsewhereJob(row(1, WALLET, 9), AGENT), null, 'a status the kernel does not have is not a job');
});
