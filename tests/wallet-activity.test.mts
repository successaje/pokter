import assert from 'node:assert/strict';
import test from 'node:test';

import { activityReading, activityRow } from '../src/lib/activity/reading';

const at = '2026-10-17T12:00:00.000Z';

test('a wallet that sent transactions says how many', () => {
  const r = activityReading({ chainId: 56, address: '0xa', sent: 1234, contract: false, checkedAt: at }, '0xa', 'BNB Chain');
  assert.equal(r.text, 'Has sent 1,234 transactions on BNB Chain');
  assert.equal(r.active, true);
});

test('none sent is a fact, not read yet is not', () => {
  assert.equal(activityReading({ chainId: 56, address: '0xa', sent: 0, contract: false, checkedAt: at }, '0xa', 'BNB Chain').active, false);
  assert.equal(activityReading(null, '0xa', 'BNB Chain').text, 'Not read yet');
  assert.equal(activityReading(null, null, 'BNB Chain').text, 'No agent wallet registered');
});

test("a contract wallet's nonce is not read as inactivity", () => {
  const r = activityReading({ chainId: 56, address: '0xa', sent: 1, contract: true, checkedAt: at }, '0xa', 'BNB Chain');
  assert.equal(r.active, null);
  assert.match(r.text, /contract wallet/);
});

test('a testnet agent shows its testnet activity beside BNB Chain', () => {
  const row = activityRow(
    { mainnet: { chainId: 56, address: '0xa', sent: 0, contract: false, checkedAt: at }, testnet: { chainId: 97, address: '0xa', sent: 16, contract: false, checkedAt: at } },
    '0xa',
    97,
  );
  assert.equal(row, 'Has sent no transactions on BNB Chain. Has sent 16 transactions on BNB Testnet');
  assert.equal(activityRow({ mainnet: null, testnet: null }, '0xa', 56), 'Not read yet');
});
