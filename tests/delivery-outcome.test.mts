import assert from 'node:assert/strict';
import test from 'node:test';

import { summariseEconomicHistory } from '../src/lib/erc8183/economic-history';
import type { HiredJob } from '../src/lib/erc8183/types';

function job(status: string, budgetU = 0.1): HiredJob {
  return {
    status, budgetRaw: String(BigInt(Math.round(budgetU * 1e6)) * 10n ** 12n),
    statusCheckedAt: new Date().toISOString(),
  } as unknown as HiredJob;
}

/**
 * The outcome a buyer sees beside an availability figure.
 *
 * BNB LP Range Rebalancer answers every probe and has completed none of the
 * escrows funded against it. Before this, the two facts lived on different
 * screens and the card showed only the flattering one.
 */

test('an agent that answered everything and delivered nothing reads as 0 of n', () => {
  const h = summariseEconomicHistory([job('FUNDED'), job('FUNDED'), job('FUNDED')]);
  assert.equal(h.jobs, 3);
  assert.equal(h.completed, 0);
});

test('completed jobs are counted, and delivery is broader than completion', () => {
  const h = summariseEconomicHistory([job('COMPLETED'), job('SUBMITTED'), job('FUNDED')]);
  assert.equal(h.completed, 1, 'only COMPLETED is completed');
  assert.equal(h.delivered, 2, 'SUBMITTED has delivered without being settled');
  assert.equal(h.jobs, 3);
});

test('an agent with no jobs reports none rather than zero of zero', () => {
  const h = summariseEconomicHistory([]);
  assert.equal(h.jobs, 0, 'the card shows nothing at all in this case');
  assert.equal(h.completed, 0);
});

test('an unfunded job is not counted against an agent', () => {
  // OPEN means nobody put money behind it, so it is not a delivery failure.
  const h = summariseEconomicHistory([job('OPEN'), job('COMPLETED')]);
  assert.equal(h.jobs, 1);
  assert.equal(h.completed, 1);
});

test('expired escrow is visible as its own outcome', () => {
  const h = summariseEconomicHistory([job('EXPIRED'), job('EXPIRED'), job('COMPLETED')]);
  assert.equal(h.expired, 2);
  assert.equal(h.completed, 1);
  assert.equal(h.jobs, 3);
});
