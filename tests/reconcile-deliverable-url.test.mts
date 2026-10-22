import assert from 'node:assert/strict';
import test from 'node:test';

import { deliverableUrlForIndex } from '../src/lib/erc8183/deliverable-url';

/*
 * The reconcile pass ran a 74s backward chain scan for every delivered job
 * in its batch, every run, though the URL was already stored and cannot
 * change. These pin when a lookup may happen at all.
 */
const counting = () => {
  let calls = 0;
  return { lookup: async () => { calls += 1; return 'https://found.example/m'; }, calls: () => calls };
};

test('a stored URL is kept and no lookup runs', async () => {
  const c = counting();
  assert.equal(await deliverableUrlForIndex({ stored: 'https://stored.example/m', status: 'COMPLETED', lookup: c.lookup }), 'https://stored.example/m');
  assert.equal(c.calls(), 0);
});

test('an undelivered job is never looked up', async () => {
  const c = counting();
  for (const status of ['OPEN', 'FUNDED', 'REJECTED', 'EXPIRED']) assert.equal(await deliverableUrlForIndex({ stored: null, status, lookup: c.lookup }), undefined);
  assert.equal(c.calls(), 0);
});

test('a delivered job with no stored URL is looked up once, and a failed lookup is not fatal', async () => {
  const c = counting();
  assert.equal(await deliverableUrlForIndex({ stored: null, status: 'SUBMITTED', lookup: c.lookup }), 'https://found.example/m');
  assert.equal(c.calls(), 1);
  assert.equal(await deliverableUrlForIndex({ stored: undefined, status: 'COMPLETED', lookup: async () => { throw new Error('getLogs refused'); } }), undefined);
});
