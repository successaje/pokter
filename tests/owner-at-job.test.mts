import assert from 'node:assert/strict';
import test from 'node:test';

import { fundedRecently, OWNER_WINDOW_MS, ownerCandidate } from '../src/lib/erc8183/owner-at-job';

const now = Date.parse('2026-10-20T12:00:00Z');
const job = { status: 'FUNDED', hireTxHash: '0xabc', hiredAt: new Date(now - 5 * 60_000).toISOString() };

test('a job funded minutes ago, with its funding transaction, is checked', () => {
  assert.equal(ownerCandidate(job, false, now), true);
});

test('an owner is recorded once and never replaced', () => {
  assert.equal(ownerCandidate(job, true, now), false);
});

test('without a funding transaction there is no proof of when it was funded', () => {
  assert.equal(ownerCandidate({ ...job, hireTxHash: null }, false, now), false);
});

test('an unfunded job has no owner to record', () => {
  assert.equal(ownerCandidate({ ...job, status: 'OPEN' }, false, now), false);
});

test('a job first seen outside the window is left unattributed', () => {
  assert.equal(ownerCandidate({ ...job, hiredAt: new Date(now - OWNER_WINDOW_MS - 1).toISOString() }, false, now), false);
});

test('a backfilled job seen today is judged by its funding block, not by when Pokter saw it', () => {
  // Backfill writes hiredAt as the day it ran; the block says the job is months old.
  const backfilled = { ...job, hiredAt: new Date(now - 60_000).toISOString() };
  assert.equal(ownerCandidate(backfilled, false, now), true);
  assert.equal(fundedRecently(Date.parse('2026-06-01T00:00:00Z'), now), false);
});

test('the funding block must fall within the window of the owner read', () => {
  assert.equal(fundedRecently(now - 30 * 60_000, now), true);
  assert.equal(fundedRecently(now - OWNER_WINDOW_MS, now), true);
  assert.equal(fundedRecently(now - OWNER_WINDOW_MS - 1, now), false);
  assert.equal(fundedRecently(now + 10 * 60_000, now), false);
  assert.equal(fundedRecently(Number.NaN, now), false);
});
