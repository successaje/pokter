import assert from 'node:assert/strict';
import test from 'node:test';

import { V3_COMPARABLE_BLOCKS, answerReadBlock, gradePaidV3Scenarios, readV3Answer, statusOf } from '../src/lib/assay/v3-grade';
import type { V3Reading } from '../src/lib/assay/pancakeswap-v3';

const pos = (id: string, tick: number, lower: number, upper: number, open = true) =>
  ({ id, staked: false, tickLower: lower, tickUpper: upper, tick, liquidity: open ? '100' : '0', open, inRange: open && tick >= lower && tick < upper });

const reading = (...positions: ReturnType<typeof pos>[]): V3Reading => ({
  account: '0x3aF6183cbe75c2b33D727191EaE5aa23C174E883',
  block: 127841246n,
  positions,
  openCount: positions.filter((p) => p.open).length,
  inRangeCount: positions.filter((p) => p.inRange).length,
});

/** Read at the same block as the reading below, unless a test says otherwise. */
const manifest = (positions: Array<{ position: string; status: string }>, block = 127841246) =>
  JSON.stringify({ response: { content: JSON.stringify({ account: '0x3aF6…', positions, as_of: { block: String(block), time: '2026-10-16T04:12:41.000Z' } }) } });

test('a withdrawn position is closed, not out of range', () => {
  // There is nothing in it, so "out of range" would imply money sitting idle.
  assert.equal(statusOf(pos('1', 100, 0, 50, false)), 'closed');
  assert.equal(statusOf(pos('2', 100, 0, 50)), 'out-of-range');
  assert.equal(statusOf(pos('3', 25, 0, 50)), 'in-range');
});

test('the position id is read from the agent\'s own label', () => {
  const said = readV3Answer({ text: null, data: { positions: [{ position: '#7674122 CAKE/USDT 0.25%', status: 'in-range' }] } });
  assert.equal(said.get('7674122'), 'in-range');
  // Nothing claimed is an empty map, never agreement.
  assert.equal(readV3Answer({ text: null, data: { positions: [] } }).size, 0);
  assert.equal(readV3Answer({ text: null, data: null }).size, 0);
});

test('agreeing with Pokter on every position passes', () => {
  const rows = gradePaidV3Scenarios({
    jobId: '9', readAt: '2026-10-15T19:00:00Z',
    reading: reading(pos('7674122', 15605, 15600, 15620), pos('7659413', 73647, 66600, 70800, false)),
    manifestText: manifest([
      { position: '#7674122 CAKE/USDT 0.25%', status: 'in-range' },
      { position: '#7659413 BNB/USDT 0.05%', status: 'closed' },
    ]),
  });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.pass), rows.map((r) => r.reason).join(' | '));
  assert.deepEqual(rows.map((r) => r.scenario), ['#7674122', '#7659413']);
});

test('a position left out of the answer is a miss, not a pass', () => {
  /*
   * The failure this exists for: an answer looks complete while omitting
   * the position that matters. Silence must never score as agreement.
   */
  const rows = gradePaidV3Scenarios({
    jobId: '9', readAt: '2026-10-15T19:00:00Z',
    reading: reading(pos('1', 25, 0, 50), pos('2', 99, 0, 50)),
    manifestText: manifest([{ position: '#1 A/B 0.05%', status: 'in-range' }]),
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].pass, true);
  assert.equal(rows[1].pass, false);
  assert.equal(rows[1].outcome, 'unanswered');
});

test('disagreeing about range fails, and says both figures', () => {
  const rows = gradePaidV3Scenarios({
    jobId: '9', readAt: '2026-10-15T19:00:00Z',
    reading: reading(pos('1', 15620, 15600, 15620)),
    manifestText: manifest([{ position: '#1 A/B 0.05%', status: 'in-range' }]),
  });
  assert.equal(rows[0].pass, false);
  assert.equal(rows[0].outcome, 'wrong');
  // At the upper tick the position earns nothing, so the agent is wrong.
  assert.match(rows[0].reason, /out-of-range/);
  assert.match(rows[0].reason, /answer said in-range/);
});

test('an empty wallet is still a check: inventing a position fails', () => {
  const honest = gradePaidV3Scenarios({ jobId: '9', readAt: '2026-10-15T19:00:00Z', reading: reading(), manifestText: manifest([]) });
  assert.equal(honest[0].pass, true);
  assert.equal(honest[0].scenario, 'no-positions');

  const invented = gradePaidV3Scenarios({ jobId: '9', readAt: '2026-10-15T19:00:00Z', reading: reading(), manifestText: manifest([{ position: '#404 A/B', status: 'in-range' }]) });
  assert.equal(invented[0].pass, false);
  assert.match(invented[0].reason, /found no v3 position/);
});

test('pending, undelivered and unreadable stay distinct', () => {
  const r = reading(pos('1', 25, 0, 50));
  assert.equal(gradePaidV3Scenarios({ jobId: '1', readAt: 'x', reading: r, manifestText: null, deliveryOpen: true })[0].outcome, 'pending');
  assert.equal(gradePaidV3Scenarios({ jobId: '1', readAt: 'x', reading: r, manifestText: null, deliveryOpen: false })[0].outcome, 'undelivered');
  assert.equal(gradePaidV3Scenarios({ jobId: '1', readAt: 'x', reading: r, manifestText: '{}' })[0].outcome, 'unreadable');
  assert.equal(gradePaidV3Scenarios({ jobId: '1', readAt: 'x', reading: null, manifestText: manifest([]) })[0].outcome, 'not-comparable');
});

test('a truncated answer is not failed for the positions it declared it skipped', () => {
  /*
   * An agent may cap how many positions it reads, and Centreline says so.
   * A position missing from a truncated answer is a declared limit, not an
   * oversight, and must not be counted against it — while a position
   * missing from an answer that claims completeness still is.
   */
  const r = reading(pos('1', 25, 0, 50), pos('2', 25, 0, 50));
  const truncated = JSON.stringify({ response: { content: JSON.stringify({
    positions: [{ position: '#1 A/B 0.05%', status: 'in-range' }],
    note: 'Only the first 20 positions were read.',
    as_of: { block: '127841246', time: '2026-10-16T04:12:41.000Z' },
  }) } });
  const rows = gradePaidV3Scenarios({ jobId: '9', readAt: 'x', reading: r, manifestText: truncated });
  assert.equal(rows[0].pass, true);
  assert.equal(rows[1].outcome, 'not-comparable', 'declared limit, not an oversight');
  assert.notEqual(rows[1].outcome, 'unanswered');
});

test('a delivery too far from Pokter\'s reading is set aside, agreement included', () => {
  /*
   * Stricter than the health factor rule on purpose. There a stale answer
   * that still matches to within 2% passes, because hitting a decimal by
   * chance is unlikely. Here the answer is one of three words and most
   * positions are in range, so a stale agreement could as easily be the
   * price having moved back.
   *
   * Job 1484 was graded 38,475 blocks — 4.8 hours — after Centreline read
   * the pool, and agreed. Sound, but nothing in the grading established it.
   */
  const r = reading(pos('1', 25, 0, 50));
  const agrees = [{ position: '#1 A/B 0.05%', status: 'in-range' }];

  const fresh = gradePaidV3Scenarios({ jobId: '9', readAt: 'x', reading: r, manifestText: manifest(agrees, 127841246) });
  assert.equal(fresh[0].pass, true, 'same block: compared and passed');

  const stale = gradePaidV3Scenarios({ jobId: '9', readAt: 'x', reading: r, manifestText: manifest(agrees, 127841246 - V3_COMPARABLE_BLOCKS - 1) });
  assert.equal(stale[0].pass, false);
  assert.equal(stale[0].outcome, 'not-comparable', 'agreement does not rescue a stale delivery');
  assert.match(stale[0].reason, /blocks apart/);

  const edge = gradePaidV3Scenarios({ jobId: '9', readAt: 'x', reading: r, manifestText: manifest(agrees, 127841246 - V3_COMPARABLE_BLOCKS) });
  assert.equal(edge[0].pass, true, 'exactly at the window is still comparable');
});

test('an answer that states no block cannot be placed in time', () => {
  const r = reading(pos('1', 25, 0, 50));
  const noBlock = JSON.stringify({ response: { content: JSON.stringify({ positions: [{ position: '#1 A/B', status: 'in-range' }] }) } });
  assert.equal(answerReadBlock(noBlock), null);
  const rows = gradePaidV3Scenarios({ jobId: '9', readAt: 'x', reading: r, manifestText: noBlock });
  assert.equal(rows[0].outcome, 'not-comparable');
  assert.match(rows[0].reason, /does not say which block/);
});

test('the block an answer read is recovered from its as_of', () => {
  assert.equal(answerReadBlock(manifest([], 127912411)), 127912411);
  assert.equal(answerReadBlock('not json'), null);
});
