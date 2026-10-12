import assert from 'node:assert/strict';
import test from 'node:test';

import { escrowMoney } from '../src/lib/network/presentation';

/*
 * Whether a hire spends real money, per agent.
 *
 * The same number — "0.10 $U" — is a real cost on one chain and faucet
 * currency on the other, and this is what the page says about it. Getting
 * it backwards is the worst single error this interface can make, so the
 * strings are pinned rather than left to a reader of the component.
 */

test('mainnet is named as real money', () => {
  const money = escrowMoney(56);
  assert.equal(money.real, true);
  assert.equal(money.money, 'Real funds');
  assert.equal(money.network, 'BNB Chain');
  assert.equal(money.note, 'Real funds on BNB Chain');
  assert.ok(!/test/i.test(money.note), 'never says test about mainnet');
});

test('testnet says the tokens have no value', () => {
  const money = escrowMoney(97);
  assert.equal(money.real, false);
  assert.equal(money.money, 'Test tokens');
  assert.equal(money.note, 'Test tokens on BNB Testnet — no real value');
});

test('an unrecognised chain reassures nobody', () => {
  /*
   * Fails in the safe direction. Calling an unchecked chain "test tokens"
   * is how somebody authorises real money believing it is play money, so
   * an unknown chain claims neither and only says where.
   */
  const money = escrowMoney(1);
  assert.equal(money.real, null);
  assert.equal(money.money, null);
  assert.ok(!/test tokens|real funds/i.test(money.note), money.note);
  assert.match(money.note, /chain 1/);
});
