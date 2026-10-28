import assert from 'node:assert/strict';
import test from 'node:test';

import { summariseEconomicHistory } from '../src/lib/erc8183/economic-history';
import type { HiredJob } from '../src/lib/erc8183/types';

function job(status: string, budgetU = 0.1): HiredJob {
  return {
    status, budgetRaw: String(BigInt(Math.round(budgetU * 1e6)) * 10n ** 12n),
    statusCheckedAt: new Date().toISOString(),
    /* An ordinary agent's own wallet: not one of Pokter's declared ones. */
    provider: '0x1111111111111111111111111111111111111111',
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

test('a funded job past its deadline counts as missed even before anyone reclaims it', () => {
  const now = Date.parse('2026-10-11T12:00:00Z');
  const at = (status: string, expiredAt: string) => ({ ...job(status), expiredAt }) as HiredJob;
  const h = summariseEconomicHistory([
    at('FUNDED', '2026-10-10T12:00:00Z'), // lapsed, not reclaimed
    at('EXPIRED', '2026-10-09T12:00:00Z'), // lapsed and reclaimed
    at('FUNDED', '2026-10-12T12:00:00Z'), // still inside its window
    at('COMPLETED', '2026-10-09T12:00:00Z'),
  ], now);
  assert.equal(h.missed, 2);
  assert.equal(h.pending, 1);
  assert.equal(h.delivered, 1);
});

test('deliveries are split by who submitted them', () => {
  const operator = (status: string) =>
    ({ ...job(status), provider: '0x60eF148485C2a5119fa52CA13c52E9fd98F28e87' }) as HiredJob;
  const h = summariseEconomicHistory([job('COMPLETED'), operator('COMPLETED')]);
  assert.equal(h.delivered, 2);
  assert.equal(h.selfDelivered, 1);
  assert.equal(h.operatorDelivered, 1);
});

test('a delivery with no recorded submitter counts as neither', () => {
  const unknown = { ...job('COMPLETED'), provider: undefined } as unknown as HiredJob;
  const h = summariseEconomicHistory([unknown]);
  assert.equal(h.delivered, 1);
  assert.equal(h.selfDelivered, 0);
  assert.equal(h.operatorDelivered, 0);
});

test('an operator hiring their own agent is not outside demand', () => {
  const wallet = '0xf9Ad22cAA6C179Eee86806FA10176e845ea8e982';
  const self = { ...job('COMPLETED'), client: wallet, provider: wallet } as unknown as HiredJob;
  const real = { ...job('COMPLETED'), client: '0x00000000000000000000000000000000000000B2' } as unknown as HiredJob;
  const h = summariseEconomicHistory([self, real]);
  assert.equal(h.selfHire, 1);
  assert.equal(h.outsideTeam.jobs, 1, 'the self-hire must not count as demand');
  assert.equal(h.outsideTeam.uniqueBuyers, 1);
});
