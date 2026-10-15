import assert from 'node:assert/strict';
import test from 'node:test';

import { deliveryAnswered, figuresIn, isReusableTask, pickAnsweredTasks, stripMarketplaceTag, taskFromDescription } from '../src/lib/agent/answered-tasks';

const manifest = (content: unknown) => JSON.stringify({ job_id: 1, response: { content: typeof content === 'string' ? content : JSON.stringify(content), content_type: 'text/plain' } });

test("an error dressed as a delivery is not an answer", () => {
  // Sluicegate's reply to job 56997.
  assert.equal(deliveryAnswered(manifest({ error: 'the task does not state the APR currently earned', need: 'net APR depends on the asset and the size being moved' })), 'unanswered');
  assert.equal(deliveryAnswered(manifest({ recommend: true, venue: 'venus', netAprPct: 3.42 })), 'answered');
  assert.equal(deliveryAnswered(manifest('Venus pays 3.4% on USDT after costs; nothing else clears the threshold.')), 'answered');
  assert.equal(deliveryAnswered(manifest('error: unsupported')), 'unanswered');
  assert.equal(deliveryAnswered('not json'), 'unreadable');
});

test('the brief is read from either description format', () => {
  assert.equal(taskFromDescription(JSON.stringify({ task: 'Where should 1000 USDT earn the most?' })), 'Where should 1000 USDT earn the most?');
  assert.equal(taskFromDescription(JSON.stringify({ task_description: 'Check 56/303779' })), 'Check 56/303779');
  assert.equal(taskFromDescription('Plain text brief'), 'Plain text brief');
  assert.equal(taskFromDescription(JSON.stringify({ other: 1 })), null);
});

test("another marketplace's attribution tag is dropped", () => {
  assert.equal(stripMarketplaceTag('Best net yield: 1000 USDT on BNB Smart Chain, via example-market.com'), 'Best net yield: 1000 USDT on BNB Smart Chain');
});

test('only short, plain, general tasks are offered for reuse', () => {
  assert.equal(isReusableTask('Where should 1000 USDT earn the most on BNB Chain right now, after switching costs?'), true);
  assert.equal(isReusableTask('{"wallet":"0x1"}'), false);
  assert.equal(isReusableTask('Check health of 0x1111111111111111111111111111111111111111'), false);
  assert.equal(isReusableTask('x'.repeat(400)), false);
});

test('answered tasks: newest first, distinct, answered only', () => {
  const task = (t: string) => JSON.stringify({ task: t });
  const picked = pickAnsweredTasks([
    { jobId: 1, description: task('Where should 1000 USDT earn the most on BNB Chain right now?'), verdict: 'answered' },
    { jobId: 5, description: task('where should 1000 usdt earn the most on BNB Chain right now'), verdict: 'answered' },
    { jobId: 4, description: task('Size: 500 USDT. Currently: idle, earning 0%.'), verdict: 'unanswered' },
    { jobId: 3, description: task('Best net yield: 1000 USDT on BNB Smart Chain, via example-market.com'), verdict: 'answered' },
    { jobId: 2, description: task('Still funded, not yet delivered'), verdict: 'pending' },
  ]);
  assert.deepEqual(picked.map((p) => p.task), ['where should 1000 usdt earn the most on BNB Chain right now', 'Best net yield: 1000 USDT on BNB Smart Chain']);
  // Where each wording was seen, and whose figures it carries.
  assert.deepEqual(picked.map((p) => p.jobId), [5, 3]);
  assert.deepEqual(picked[1].figures, ['1000 USDT']);
});

test('figures are another buyer’s amounts and percentages, not every number', () => {
  assert.deepEqual(figuresIn('Move 2.5 BNB if the APY drops below 4%, checking every 6 hours'), ['2.5 BNB', '4%']);
  assert.deepEqual(figuresIn('Top 3 yields on BNB Chain'), []);
});
