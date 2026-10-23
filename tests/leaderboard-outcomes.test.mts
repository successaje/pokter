import assert from 'node:assert/strict';
import test from 'node:test';

import type { HiredJob } from '../src/lib/erc8183/types';
import type { BoardAgent } from '../src/lib/leaderboard/network';
import {
  buildOutcomeBoard,
  deliverySubmitter,
  judgeJob,
  OUTCOME_METRICS,
  outcomeMetricFrom,
  sortOutcomeRows,
  type OutcomeRow,
  type OutcomeTests,
} from '../src/lib/leaderboard/outcomes';

const POKTER = '0x93847647d7eb72a69e162117df6a8697df53edda';
const AGENT_WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BUYER_A = '0x0e98146f00000000000000000000000000009fda';
const BUYER_B = '0x74f5ed4600000000000000000000000000000c6ab';
const BUYER_C = '0x3ee8cfa2000000000000000000000000000095ff';

let nextJob = 1000;

function job(overrides: Partial<HiredJob> = {}): HiredJob {
  nextJob += 1;
  return {
    id: `97:${nextJob}`,
    jobId: String(nextJob),
    chainId: 97,
    isTestnet: true,
    agentChainId: 97,
    agentTokenId: '2618',
    agentName: 'Nagi',
    provider: AGENT_WALLET as HiredJob['provider'],
    client: BUYER_A as HiredJob['client'],
    task: 'Assess the position.',
    budgetRaw: '100000000000000000',
    expiredAt: '2026-10-22T00:00:00.000Z',
    hiredAt: '2026-10-20T00:00:00.000Z',
    hireTxHash: null,
    status: 'COMPLETED',
    statusCheckedAt: '2026-10-23T12:26:00.000Z',
    deliverableUrl: null,
    settleTxHash: null,
    ...overrides,
  };
}

const team = new Set([POKTER]);

function tests(overrides: Partial<OutcomeTests> = {}): OutcomeTests {
  return {
    teamFunded: (j) => !j.client || team.has(j.client.toLowerCase()),
    selfHire: (j) => Boolean(j.client) && j.client!.toLowerCase() === String(j.provider ?? '').toLowerCase(),
    lifecycleDemo: () => false,
    relayedDelivery: () => false,
    operatorWallet: (address) => team.has(address),
    ...overrides,
  };
}

function agent(overrides: Partial<BoardAgent> = {}): BoardAgent {
  return {
    key: '97:2618',
    chainId: 97,
    tokenId: '2618',
    name: 'Nagi',
    imageUrl: null,
    category: 'yield',
    owner: '0xowner',
    ...overrides,
  };
}

function board(jobs: HiredJob[], options: Partial<Parameters<typeof buildOutcomeBoard>[1]> = {}) {
  return buildOutcomeBoard(jobs, {
    escrowChainId: 97,
    metric: 'settled-jobs',
    agents: new Map([['97:2618', agent()]]),
    listedOwners: new Set<string>(),
    reviewerAuthors: new Map(),
    tests: tests(),
    ...options,
  });
}

/*
 * The distinction the whole board rests on. A `COMPLETED` job says the escrow
 * released; it does not say the agent produced anything. Pokter's courier can
 * take a job to COMPLETED with nothing of the agent's in it, and crediting
 * that to the agent is the substitution this file exists to refuse.
 */
test('a settled job delivered by Pokter’s courier is not the agent’s evidence', () => {
  const couriered = job({ provider: POKTER as HiredJob['provider'] });
  assert.equal(deliverySubmitter(couriered, tests()), 'pokter-courier');
  const verdict = judgeJob(couriered, tests());
  assert.equal(verdict.counts, false);
  assert.equal(verdict.exclusion, 'pokter-courier');

  const built = board([couriered]);
  assert.equal(built.rows.length, 1, 'the row is kept so a served buyer stays visible');
  assert.equal(built.rows[0].settledJobs, 0);
  assert.equal(built.rows[0].courierSettled, 1);
  assert.equal(built.coverage.qualifyingJobs, 0);
  assert.equal(built.coverage.exclusions.pokterCourier, 1);
});

/*
 * The manifest outranks the address, per `carriesRelayedAnswerFor`: the
 * courier submits from a Pokter wallet whichever agent answered, so the
 * address alone can only say "a Pokter wallet delivered this". Job 97/1585 is
 * the case — the agent answered over A2A and the courier submitted it.
 */
test('a courier delivery carrying the agent’s own answer does count', () => {
  const relayed = job({ provider: POKTER as HiredJob['provider'] });
  const built = board([relayed], { tests: tests({ relayedDelivery: () => true }) });
  assert.equal(built.rows[0].settledJobs, 1);
  assert.equal(built.rows[0].courierSettled, 0);
  assert.equal(built.coverage.exclusions.pokterCourier, 0);
});

test('a delivery with no recorded submitter is evidence in neither direction', () => {
  const unknown = job({ provider: undefined as unknown as HiredJob['provider'] });
  const verdict = judgeJob(unknown, tests());
  assert.equal(verdict.counts, false);
  assert.equal(verdict.exclusion, 'unknown-submitter');
  assert.equal(board([unknown]).coverage.exclusions.unknownSubmitter, 1);
});

/*
 * Job 97/1582: outside-funded, still FUNDED, and the escrow names Pokter's
 * operator key as provider. Pokter owes that delivery. Reading it as an agent
 * that takes money and does not deliver is the mistake `operatorMissed` is
 * kept apart from `missed` to avoid.
 */
test('an undelivered job Pokter owes never lands on the agent’s row', () => {
  const owed = job({ status: 'FUNDED', provider: POKTER as HiredJob['provider'] });
  assert.equal(judgeJob(owed, tests()).exclusion, 'pokter-owed');
  const built = board([owed]);
  assert.equal(built.rows.length, 0);
  assert.equal(built.platformOwed.length, 1);
  assert.equal(built.coverage.exclusions.pokterOwed, 1);
  assert.equal(built.coverage.exclusions.agentUndelivered, 0);
});

test('an expired job Pokter owes is also Pokter’s, not the agent’s miss', () => {
  const lapsed = job({ status: 'EXPIRED', provider: POKTER as HiredJob['provider'] });
  assert.equal(judgeJob(lapsed, tests()).exclusion, 'pokter-owed');
});

test('an undelivered job the agent owes is separated from one Pokter owes', () => {
  const built = board([job({ status: 'FUNDED' })]);
  assert.equal(built.coverage.exclusions.agentUndelivered, 1);
  assert.equal(built.coverage.exclusions.pokterOwed, 0);
  assert.equal(built.platformOwed.length, 0);
});

/*
 * Delivered and unsettled is its own column. Folded into the settled count it
 * would claim money has moved when the escrow is still holding it, which is
 * the one thing a buyer-discovery board must not get wrong.
 */
test('delivered-but-unsettled is counted apart from settled', () => {
  const built = board([job(), job({ status: 'SUBMITTED' })]);
  assert.equal(built.rows[0].settledJobs, 1);
  assert.equal(built.rows[0].deliveredUnsettled, 1);
  assert.equal(built.coverage.qualifyingJobs, 1, 'only the settled job qualifies');
});

test('team-funded, self-hired and demo jobs are excluded and named', () => {
  const built = board([
    job({ client: POKTER as HiredJob['client'] }),
    job({ client: AGENT_WALLET as HiredJob['client'] }),
    job(),
  ], { tests: tests({ lifecycleDemo: (j) => j.client === BUYER_A }) });
  assert.equal(built.rows.length, 0);
  assert.deepEqual(
    {
      teamFunded: built.coverage.exclusions.teamFunded,
      selfHire: built.coverage.exclusions.selfHire,
      lifecycleDemo: built.coverage.exclusions.lifecycleDemo,
    },
    { teamFunded: 1, selfHire: 1, lifecycleDemo: 1 },
  );
});

/*
 * Eight indexed rows carry no numeric agent token id. `jobAgentKey` would
 * mint a key for them out of the escrow chain, inventing an attribution the
 * row does not support, so they get no row at all.
 */
test('a job naming no ERC-8004 identity is counted but never given a row', () => {
  const built = board([job({ agentTokenId: 'seller-release-proof' })]);
  assert.equal(built.rows.length, 0);
  assert.equal(built.coverage.exclusions.unattributed, 1);
});

/*
 * The escrow chain is the split, not the agent's registry chain: 22 indexed
 * jobs settled on the testnet escrow against a mainnet-registered agent, and
 * filing those under a heading a buyer reads as mainnet would tell them test
 * tokens were money.
 */
test('the board holds only jobs that settled on its own escrow chain', () => {
  const built = board([job(), job({ chainId: 56, id: '56:1', jobId: '1' })]);
  assert.equal(built.coverage.indexedJobs, 1);
  assert.equal(built.rows[0].settledJobs, 1);
});

test('a mainnet-registered agent paid on the testnet escrow appears on the testnet board', () => {
  const built = board([job({ agentChainId: 56, agentTokenId: '344121' })], {
    agents: new Map([['56:344121', agent({ key: '56:344121', chainId: 56, tokenId: '344121', name: 'Mandate Grid-1' })]]),
  });
  assert.equal(built.rows.length, 1);
  assert.equal(built.rows[0].agent.chainId, 56, 'the registry chain is carried for the row to label');
  assert.equal(built.escrowChainId, 97);
});

test('repeat buyers count wallets, not jobs', () => {
  const built = board([
    job({ client: BUYER_A as HiredJob['client'] }),
    job({ client: BUYER_A as HiredJob['client'] }),
    job({ client: BUYER_A as HiredJob['client'] }),
    job({ client: BUYER_B as HiredJob['client'] }),
    job({ client: BUYER_B as HiredJob['client'] }),
    job({ client: BUYER_C as HiredJob['client'] }),
  ]);
  assert.equal(built.rows[0].settledJobs, 6);
  assert.equal(built.rows[0].externalBuyers, 3);
  assert.equal(built.rows[0].repeatBuyers, 2);
});

test('a buyer wallet is counted once however it is cased', () => {
  const built = board([
    job({ client: BUYER_A.toUpperCase() as HiredJob['client'] }),
    job({ client: BUYER_A as HiredJob['client'] }),
  ]);
  assert.equal(built.rows[0].externalBuyers, 1);
  assert.equal(built.rows[0].repeatBuyers, 1);
});

/*
 * `selfHire` only compares client against provider, so one operator buying
 * another operator's agent passes every exclusion as outside demand. It may
 * be genuine demand; a buyer-discovery board has to show it either way.
 */
test('a buyer who owns a listed agent is disclosed, not excluded', () => {
  const built = board([job({ client: BUYER_C as HiredJob['client'] }), job({ client: BUYER_A as HiredJob['client'] })], {
    listedOwners: new Set([BUYER_C]),
  });
  assert.equal(built.rows[0].settledJobs, 2, 'still counted as settled work');
  assert.equal(built.rows[0].externalBuyers, 2);
  assert.equal(built.rows[0].operatorBuyers, 1);
});

/*
 * Null, not zero. An RPC that did not answer is not evidence that the buyer
 * and the reviewer are different parties, and the disclosure only means
 * anything if its absence is visible.
 */
test('unread attestation authors leave the reviewer overlap null', () => {
  assert.equal(board([job()]).rows[0].reviewerBuyers, null);
});

test('a buyer who also wrote an attestation about the agent is flagged', () => {
  const built = board([job({ client: BUYER_A as HiredJob['client'] }), job({ client: BUYER_B as HiredJob['client'] })], {
    reviewerAuthors: new Map([['97:2618', new Set([BUYER_A])]]),
  });
  assert.equal(built.rows[0].reviewerBuyers, 1);
});

/*
 * No composite score: the order is the one named column, and a tie breaks on
 * a name rather than on a second metric, so the header remains the whole
 * explanation of the order.
 */
test('each metric orders by itself alone', () => {
  const rows = [
    { agent: agent({ key: 'a', name: 'Alpha' }), settledJobs: 9, externalBuyers: 1, repeatBuyers: 0 },
    { agent: agent({ key: 'b', name: 'Bravo' }), settledJobs: 2, externalBuyers: 2, repeatBuyers: 2 },
    { agent: agent({ key: 'c', name: 'Charlie' }), settledJobs: 3, externalBuyers: 9, repeatBuyers: 1 },
  ] as unknown as OutcomeRow[];
  assert.deepEqual(sortOutcomeRows(rows, 'settled-jobs').map((r) => r.agent.key), ['a', 'c', 'b']);
  assert.deepEqual(sortOutcomeRows(rows, 'external-buyers').map((r) => r.agent.key), ['c', 'b', 'a']);
  assert.deepEqual(sortOutcomeRows(rows, 'repeat-buyers').map((r) => r.agent.key), ['b', 'c', 'a']);
});

test('a tie breaks on the name, never on another metric', () => {
  const rows = [
    { agent: agent({ key: 'z', name: 'Zulu' }), settledJobs: 4, externalBuyers: 9, repeatBuyers: 9 },
    { agent: agent({ key: 'a', name: 'Alpha' }), settledJobs: 4, externalBuyers: 1, repeatBuyers: 0 },
  ] as unknown as OutcomeRow[];
  assert.deepEqual(
    sortOutcomeRows(rows, 'settled-jobs').map((r) => r.agent.name),
    ['Alpha', 'Zulu'],
    'buyer counts differ wildly and must not decide the order',
  );
});

test('there is no metric that combines the others', () => {
  assert.equal(OUTCOME_METRICS.length, 3);
  assert.equal(outcomeMetricFrom('overall'), 'settled-jobs', 'an unknown metric falls back, it is not invented');
  assert.equal(outcomeMetricFrom(undefined), 'settled-jobs');
  assert.equal(outcomeMetricFrom(['repeat-buyers']), 'repeat-buyers');
  for (const metric of OUTCOME_METRICS) {
    assert.ok(metric.column.length > 0, `${metric.id} must name its column`);
    assert.ok(metric.definition.length > 0, `${metric.id} must define its population`);
  }
});

/*
 * The empty board has to be produced by the rules, not by a branch. Mainnet
 * is this case today: every indexed job on escrow 56 is team-funded.
 */
test('a network whose every job is excluded yields no rows and a full account of why', () => {
  const built = buildOutcomeBoard(
    [
      job({ chainId: 56, id: '56:1', jobId: '1', client: POKTER as HiredJob['client'] }),
      job({ chainId: 56, id: '56:2', jobId: '2', client: POKTER as HiredJob['client'] }),
    ],
    {
      escrowChainId: 56,
      metric: 'settled-jobs',
      agents: new Map(),
      listedOwners: new Set<string>(),
      reviewerAuthors: new Map(),
      tests: tests(),
    },
  );
  assert.deepEqual(built.rows, []);
  assert.equal(built.coverage.indexedJobs, 2, 'coverage still reports what was read');
  assert.equal(built.coverage.qualifyingJobs, 0);
  assert.equal(built.coverage.exclusions.teamFunded, 2);
  assert.equal(built.coverage.lastRefreshedAt, '2026-10-23T12:26:00.000Z', 'last refresh is reported even with no rows');
});

test('an unattributed job alone still reports a refresh time rather than nothing', () => {
  const built = board([job({ agentTokenId: 'early-demo' })]);
  assert.equal(built.coverage.lastRefreshedAt, '2026-10-23T12:26:00.000Z');
});

test('an agent missing from the listing keeps its settlements and is marked unlisted', () => {
  const built = board([job({ agentTokenId: '9999', agentName: 'Delisted Agent' })], { agents: new Map() });
  assert.equal(built.rows.length, 1);
  assert.equal(built.rows[0].listed, false);
  assert.equal(built.rows[0].agent.name, 'Delisted Agent');
  assert.equal(built.coverage.unlistedAgentRows, 1);
});

/*
 * Legacy rows carry Pokter's own seller label whichever agent was hired, so a
 * label must never become an agent's name on a board.
 */
test('Pokter’s own seller label is refused as an agent name', () => {
  const built = board([job({ agentTokenId: '4242', agentName: 'Verified testnet seller' })], { agents: new Map() });
  assert.equal(built.rows[0].agent.name, 'Agent #4242');
});

test('the newest status check on a row is its last settlement', () => {
  const built = board([
    job({ statusCheckedAt: '2026-10-21T00:00:00.000Z' }),
    job({ statusCheckedAt: '2026-10-23T09:00:00.000Z' }),
  ]);
  assert.equal(built.rows[0].lastSettledAt, '2026-10-23T09:00:00.000Z');
});
