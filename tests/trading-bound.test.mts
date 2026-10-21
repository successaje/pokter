import assert from 'node:assert/strict';
import test from 'node:test';

import { boundToCap } from '../src/lib/trading/bound';

const tx = (block: number, id = String(block)) => ({ block: BigInt(block), id });

test('a range within the cap is read whole, up to the requested block', () => {
  const r = boundToCap([tx(12), tx(10)], 25, 100n);
  assert.deepEqual(r.read.map((t) => t.id), ['10', '12']);
  assert.equal(r.coveredTo, 100n);
});

test('a busy range is read oldest first, and covered only up to the last whole block read', () => {
  const found = [tx(10), tx(11), tx(12), tx(13, 'a'), tx(13, 'b')];
  const r = boundToCap(found, 3, 100n);
  assert.deepEqual(r.read.map((t) => t.id), ['10', '11', '12']);
  assert.equal(r.coveredTo, 12n);
});

test('a cut inside a block stops before that block rather than splitting it', () => {
  const r = boundToCap([tx(10), tx(11, 'a'), tx(11, 'b'), tx(11, 'c')], 2, 100n);
  assert.deepEqual(r.read.map((t) => t.id), ['10']);
  assert.equal(r.coveredTo, 10n);
});

test('more transactions in one block than the cap still move the scan forward', () => {
  const r = boundToCap([tx(10, 'a'), tx(10, 'b'), tx(10, 'c'), tx(11)], 2, 100n);
  assert.deepEqual(r.read.map((t) => t.id), ['a', 'b', 'c']);
  assert.equal(r.coveredTo, 10n);
});
