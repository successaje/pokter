import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { KeeperAction, KeeperJobFacts } from '../src/lib/erc8183/keeper-plan';
import { describeRefusal, keeperSummary, runKeeperChain, type KeeperChainDeps } from '../src/lib/erc8183/keeper-run';
import { classifyStageResult } from '../src/lib/history/stage-classify';

/*
 * The keeper's loop against a fake chain. What is held here is what keeps it
 * from sending something it should not: a dry run sends nothing, a refused
 * call is never sent, the gas floor and the per-run cap hold, nothing starts
 * after the deadline, and a failed send stops the run rather than guessing
 * the next nonce.
 */

const WEEK = 604_800;
const NOW = 1_763_500_000;
const delivered = (ago: number): KeeperJobFacts => ({ statusName: 'SUBMITTED', submittedAt: NOW - ago, expiredAt: NOW - ago + WEEK + 3600 });
const undelivered = (expiredAgo: number): KeeperJobFacts => ({ statusName: 'FUNDED', submittedAt: 0, expiredAt: NOW - expiredAgo });

function fakeChain(jobs: Record<string, KeeperJobFacts | Error>, over: Partial<KeeperChainDeps> = {}) {
  const sent: Array<{ action: KeeperAction; jobId: string; nonce: number }> = [];
  const recorded: Array<{ jobId: string; action: KeeperAction; hash: string }> = [];
  const asked = { balance: 0, nonce: 0 };
  const deps: KeeperChainDeps = {
    chainId: 97,
    candidates: Object.keys(jobs).map((jobId) => ({ jobId, amount: '0.1 $U' })),
    readJob: async (jobId) => {
      const job = jobs[jobId];
      if (job instanceof Error) throw job;
      return job;
    },
    chainNow: async () => NOW,
    disputeWindowSeconds: async () => WEEK,
    simulate: async () => undefined,
    balance: async () => {
      asked.balance += 1;
      return 10n ** 17n;
    },
    nonce: async () => {
      asked.nonce += 1;
      return 40;
    },
    send: async (action, jobId, nonce) => {
      sent.push({ action, jobId, nonce });
      return `0x${jobId.padStart(64, '0')}` as `0x${string}`;
    },
    confirm: async () => 'success',
    record: async (jobId, action, hash) => {
      recorded.push({ jobId, action, hash });
      return action === 'settle' ? 'COMPLETED' : 'EXPIRED';
    },
    ...over,
  };
  return { deps, sent, recorded, asked };
}

const ON = { mode: 'on' as const, maxSends: 6, minBalance: 10n ** 15n };

test('a dry run simulates what is due and sends nothing', async () => {
  const { deps, sent, asked } = fakeChain(
    { '1': delivered(WEEK + 60), '2': undelivered(60), '3': delivered(60) },
    { simulate: async (_action, jobId) => { if (jobId === '2') throw new Error('execution reverted: 0x8e78f0cb'); } },
  );
  const outcome = await runKeeperChain(deps, { ...ON, mode: 'dry' });
  assert.deepEqual(sent, []);
  assert.equal(asked.balance + asked.nonce, 0, 'a dry run never reads the wallet');
  assert.equal(outcome.due, 2);
  assert.equal(outcome.waiting, 1, 'the delivery still inside its window waits');
  assert.deepEqual(outcome.outcomes.map((o) => [o.jobId, o.action, o.result]), [['1', 'settle', 'would-send'], ['2', 'refund', 'refused']]);
  assert.equal(outcome.outcomes[1].reason, 'the job is not in a state that allows it (0x8e78f0cb)');
});

test('switched on, it sends each due job once, on consecutive nonces, and records what landed', async () => {
  const { deps, sent, recorded } = fakeChain({ '1': delivered(WEEK + 60), '2': undelivered(60), '3': undelivered(-60) });
  const outcome = await runKeeperChain(deps, ON);
  assert.deepEqual(sent, [{ action: 'settle', jobId: '1', nonce: 40 }, { action: 'refund', jobId: '2', nonce: 41 }]);
  assert.deepEqual(recorded.map((r) => r.jobId), ['1', '2']);
  assert.deepEqual(outcome.outcomes.map((o) => [o.result, o.after]), [['confirmed', 'COMPLETED'], ['confirmed', 'EXPIRED']]);
  assert.equal(outcome.waiting, 1, 'the job whose deadline has not passed is left to its agent');
  assert.equal(outcome.stopped, null);
});

test('a delivery past its deadline is settled, not refunded', async () => {
  const { deps, sent } = fakeChain({ '7': delivered(WEEK + 2 * 3600) });
  const outcome = await runKeeperChain(deps, ON);
  assert.deepEqual(sent.map((s) => s.action), ['settle']);
  assert.equal(outcome.outcomes[0].pastDeadline, true);
});

test('a call the escrow would refuse is not sent, and the run moves on', async () => {
  const { deps, sent } = fakeChain(
    { '1': delivered(WEEK + 60), '2': delivered(WEEK + 60) },
    { simulate: async (_action, jobId) => { if (jobId === '1') throw new Error('reverted with 0x32d53d69'); } },
  );
  const outcome = await runKeeperChain(deps, ON);
  assert.deepEqual(sent.map((s) => [s.jobId, s.nonce]), [['2', 40]], 'the refused job did not use a nonce');
  assert.equal(outcome.outcomes[0].result, 'refused');
  assert.match(outcome.outcomes[0].reason ?? '', /no dispute policy/);
});

test('below the gas floor nothing is sent', async () => {
  const { deps, sent } = fakeChain({ '1': delivered(WEEK + 60) }, { balance: async () => 10n ** 14n });
  const outcome = await runKeeperChain(deps, ON);
  assert.deepEqual(sent, []);
  assert.equal(outcome.stopped, 'gas');
  assert.equal(outcome.due, 1);
});

test('a run sends at most its cap; the rest wait for the next', async () => {
  const jobs = Object.fromEntries(['1', '2', '3'].map((id) => [id, undelivered(60)]));
  const { deps, sent } = fakeChain(jobs);
  const outcome = await runKeeperChain(deps, { ...ON, maxSends: 2 });
  assert.deepEqual(sent.map((s) => s.jobId), ['1', '2']);
  assert.equal(outcome.stopped, 'cap');
});

test('nothing is read or sent once the deadline has passed', async () => {
  const { deps, sent } = fakeChain({ '1': delivered(WEEK + 60) });
  const outcome = await runKeeperChain(deps, { ...ON, deadlineAt: 1_000, clock: () => 1_000 });
  assert.deepEqual(sent, []);
  assert.equal(outcome.checked, 0);
  assert.equal(outcome.stopped, 'deadline');
});

test('a failed send stops the run instead of guessing the next nonce', async () => {
  const { deps } = fakeChain({ '1': undelivered(60), '2': undelivered(60) });
  const tried: string[] = [];
  deps.send = async (_action, jobId) => {
    tried.push(jobId);
    throw new Error('replacement transaction underpriced');
  };
  const outcome = await runKeeperChain(deps, ON);
  assert.deepEqual(tried, ['1']);
  assert.equal(outcome.stopped, 'send-error');
  assert.deepEqual(outcome.outcomes.map((o) => o.result), ['failed']);
});

test('a send with no receipt yet is reported as sent and not recorded', async () => {
  const { deps, recorded } = fakeChain({ '1': undelivered(60) }, { confirm: async () => 'unknown' });
  const outcome = await runKeeperChain(deps, ON);
  assert.equal(outcome.outcomes[0].result, 'sent');
  assert.deepEqual(recorded, [], 'the index keeps its status until the chain confirms one');
});

test('an unreadable job is counted and left, and a job listed twice is read once', async () => {
  const { deps, sent } = fakeChain({ '1': new Error('timeout'), '2': undelivered(60) });
  deps.candidates = [...deps.candidates, { jobId: '2', amount: '0.1 $U' }];
  const outcome = await runKeeperChain(deps, ON);
  assert.equal(outcome.unread, 1);
  assert.equal(outcome.checked, 1);
  assert.deepEqual(sent.map((s) => s.jobId), ['2']);
});

test('a chain whose clock cannot be read reports it and does nothing', async () => {
  const { deps, sent } = fakeChain({ '1': undelivered(60) }, { chainNow: async () => { throw new Error('fetch failed'); } });
  const outcome = await runKeeperChain(deps, ON);
  assert.deepEqual(sent, []);
  assert.match(outcome.error ?? '', /could not read the escrow's clock/);
});

test('the log line says what moved, and nothing when nothing was due', async () => {
  const quiet = await runKeeperChain(fakeChain({ '1': undelivered(-60) }).deps, ON);
  assert.equal(keeperSummary([quiet]), '');
  const busy = await runKeeperChain(fakeChain({ '1': delivered(WEEK + 60), '2': undelivered(60) }).deps, ON);
  assert.equal(keeperSummary([{ ...busy, chainId: 56 }, { ...quiet, chainId: 97 }]), '56: 1 settled, 1 refunded');
  const dry = await runKeeperChain(fakeChain({ '2': undelivered(60) }).deps, { ...ON, mode: 'dry' });
  assert.equal(keeperSummary([dry]), '97: 1 would refund');
});

test('refusals are decoded where known and passed through where not', () => {
  assert.equal(describeRefusal(new Error('ContractFunctionRevertedError: 0x17be5b7b')), 'the review window has not closed (0x17be5b7b)');
  assert.equal(describeRefusal(new Error('reverted 0xdeadbeef')), '0xdeadbeef');
  assert.equal(describeRefusal(new Error('fetch failed\nat node')), 'fetch failed');
});

test('the sweep records a keeper that could not do its work as failed', async () => {
  assert.equal(classifyStageResult('keeper', { mode: 'off', chains: [] }), null, 'off is a deployment state');
  assert.equal(classifyStageResult('keeper', { mode: 'on', chains: [], error: 'KEEPER_KEY is not set' }), 'failed');
  assert.equal(classifyStageResult('keeper', { mode: 'dry', chains: [], error: 'KEEPER_KEY is not set' }), null, 'a dry run needs no key');

  const gasless = await runKeeperChain(fakeChain({ '1': undelivered(60) }, { balance: async () => 0n }).deps, ON);
  assert.equal(classifyStageResult('keeper', { mode: 'on', chains: [gasless] }), 'failed', 'jobs owed and no gas to send them');

  const { deps } = fakeChain({ '1': undelivered(60), '2': undelivered(60) });
  let sends = 0;
  const real = deps.send;
  deps.send = async (...args) => {
    sends += 1;
    return real(...args);
  };
  deps.confirm = async () => (sends === 1 ? 'success' : 'reverted');
  const mixed = await runKeeperChain(deps, ON);
  assert.equal(classifyStageResult('keeper', { mode: 'on', chains: [mixed] }), 'partial');

  const fine = await runKeeperChain(fakeChain({ '1': undelivered(60) }).deps, ON);
  assert.equal(classifyStageResult('keeper', { mode: 'on', chains: [fine] }), null);
});
