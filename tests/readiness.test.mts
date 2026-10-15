import assert from 'node:assert/strict';
import test from 'node:test';

import { readinessRows, type ReadinessInput } from '../src/lib/agents/readiness';

const NOW = Date.parse('2026-10-15T12:00:00Z');

// Stockroom as observed on 15 October: answered live, never swept, price expired.
const stockroom: ReadinessInput = {
  now: NOW,
  live: { answered: true, medianMs: 420 },
  record: { totalProbes: 0, totalAnswered: 0, observedDays: 0, lastSeen: null },
  quote: { quotedAt: '2026-10-15T07:37:11Z', expiresAt: '2026-10-15T07:52:11Z', current: false, payable: true },
  escrowLabel: 'BNB Chain',
  history: { jobs: 0, selfDelivered: 0, operatorDelivered: 0 },
  categoryCheck: null,
};

test('a live answer and an empty history are separate facts, neither borrowing the other', () => {
  const rows = Object.fromEntries(readinessRows(stockroom).map((row) => [row.id, row]));
  assert.equal(rows.live.value, 'Answered in 420 ms');
  assert.equal(rows.history.value, 'None yet');
  assert.equal(rows.history.tone, 'unknown');
  assert.match(rows.history.detail, /no history either way/);
});

test('an expired price is not presented as current, and its payability says so', () => {
  const rows = Object.fromEntries(readinessRows(stockroom).map((row) => [row.id, row]));
  assert.equal(rows.price.value, 'Expired');
  assert.match(rows.price.detail, /expired 4 h ago/);
  assert.match(rows.payment.detail, /last quote, which has expired/);
  assert.equal(rows.correctness.value, 'No check for its kind');
  assert.equal(rows.delivery.value, 'Never hired');
});

test('a hired agent with no delivery of its own reads as such', () => {
  const rows = Object.fromEntries(
    readinessRows({ ...stockroom, history: { jobs: 2, selfDelivered: 0, operatorDelivered: 1 } }).map((row) => [row.id, row]),
  );
  assert.equal(rows.delivery.value, 'None yet');
  assert.match(rows.delivery.detail, /Pokter wallet submitted it/);
});
