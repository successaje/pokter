import assert from 'node:assert/strict';
import test from 'node:test';

import {
  afterBackfillAttempt,
  BACKFILL_HOST_MIN_SHARE,
  BACKFILL_HOST_SAMPLE,
  BACKFILL_LOOKUPS,
  BACKFILL_PAGE,
  BACKFILL_PASSES,
  BACKFILL_QUEUE_FLOOR,
  BACKFILL_TRIES,
  endpointHost,
  hostSampledOut,
  nextBackfillPass,
} from '../src/lib/history/discovery';

/*
 * Registrations from before discovery began: read once, oldest first, each
 * tried once, with a host sampled before all of it is called.
 */

test('the passes run in order, A2A first, and the walk ends when both are read', () => {
  assert.deepEqual([...BACKFILL_PASSES], ['a2a', 'mcp']);
  assert.equal(nextBackfillPass(new Set()), 'a2a');
  assert.equal(nextBackfillPass(new Set(['a2a'])), 'mcp');
  assert.equal(nextBackfillPass(new Set(['a2a', 'mcp'])), null);
});

test('one try decides a backfilled registration', () => {
  assert.deepEqual(afterBackfillAttempt('answered'), { state: 'promoted' });
  for (const result of ['no-answer', 'no-endpoint', 'not-callable', 'no-agent-yet'] as const) {
    assert.deepEqual(afterBackfillAttempt(result), { state: 'dropped' }, `${result}: registered for weeks, so no retry schedule`);
  }
});

test('a host is judged only after it is sampled, and only a rarely answering one is sampled out', () => {
  assert.equal(BACKFILL_HOST_SAMPLE, 40);
  assert.equal(BACKFILL_HOST_MIN_SHARE, 0.1);
  assert.equal(hostSampledOut(undefined), false, 'never tried');
  assert.equal(hostSampledOut({ tried: 39, answered: 0 }), false, 'not yet sampled');
  assert.equal(hostSampledOut({ tried: 40, answered: 0 }), true, 'a host of listings with no agent behind them');
  assert.equal(hostSampledOut({ tried: 40, answered: 3 }), true, 'under one in ten');
  assert.equal(hostSampledOut({ tried: 40, answered: 4 }), false, 'one in ten keeps it called');
  assert.equal(hostSampledOut({ tried: 200, answered: 150 }), false, 'a host of working agents is called in full');
});

test('the host is what a probe would call, lower-cased', () => {
  assert.equal(endpointHost('https://Agents.Example.com/a2a/agents/12/card'), 'agents.example.com');
  assert.equal(endpointHost('https://agent.example:8443/card.json'), 'agent.example:8443');
  assert.equal(endpointHost('not a url'), null);
});

test('the pass is bounded and polite: a page at a time, a few probes per run', () => {
  assert.equal(BACKFILL_PAGE, 100);
  assert.equal(BACKFILL_QUEUE_FLOOR, 100, 'a page is read only while the queue is short');
  assert.equal(BACKFILL_LOOKUPS, 24);
  assert.equal(BACKFILL_TRIES, 8);
  assert.ok(BACKFILL_TRIES <= BACKFILL_LOOKUPS);
});
