import assert from 'node:assert/strict';
import test from 'node:test';

import { DELIVERY_WINDOW_SECONDS, deadlineTerms, describeSeconds, jobLifetimeSeconds } from '../src/lib/erc8183/deadline';

const MAINNET_WINDOW = 604_800; // disputeWindow() on chain 56
const TESTNET_WINDOW = 900; // disputeWindow() on chain 97

test('a job leaves the seller its delivery time after the dispute window is reserved', () => {
  // The mainnet policy reverts submit once less than disputeWindow remains
  // before the deadline (0x15e5dd74). With a fixed 24h deadline, every
  // Pokter mainnet job was undeliverable from the moment it was funded.
  const lifetime = jobLifetimeSeconds(MAINNET_WINDOW);
  assert.equal(lifetime - MAINNET_WINDOW, DELIVERY_WINDOW_SECONDS);
  assert.ok(lifetime > MAINNET_WINDOW);
});

test('testnet keeps a short deadline because its window is short', () => {
  assert.equal(jobLifetimeSeconds(TESTNET_WINDOW), 900 + 86_400);
});

test('the hire page says how long the money can be locked', () => {
  const terms = deadlineTerms(MAINNET_WINDOW);
  assert.match(terms.deadline, /^8 days from funding: 24 hours for the agent to deliver, then the escrow’s review window of 7 days$/);
  assert.match(terms.reclaim, /8 days from funding$/);
  assert.equal(describeSeconds(TESTNET_WINDOW), '15 minutes');
  assert.match(deadlineTerms(TESTNET_WINDOW).reclaim, /24 hours 15 minutes from funding$/);
});

test('an unreadable window is refused rather than guessed', () => {
  assert.throws(() => jobLifetimeSeconds(Number.NaN), /INVALID_DISPUTE_WINDOW/);
});
