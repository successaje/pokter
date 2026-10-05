import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEther } from 'viem';

import {
  GAS_RESERVE,
  describeSendProblem,
  sendableNative,
  parseAmount,
} from '../src/lib/wallet/send-rules';

const TO = '0x0aA36a8c9D3f48B4220cf88FA8819B064a389A0E';
const base = {
  to: TO,
  nativeBalance: parseEther('0.1'),
  paymentBalance: parseEther('5'),
  nativeSymbol: 'tBNB',
  paymentSymbol: '$U',
};

test('a well-formed send is allowed for both tokens', () => {
  assert.equal(describeSendProblem({ ...base, token: 'native', amount: parseEther('0.05') }), null);
  assert.equal(describeSendProblem({ ...base, token: 'payment', amount: parseEther('2') }), null);
});

/*
 * Gas on this chain is the same asset somebody may want to move, so the
 * reserve is a floor and not a ban — but a wallet emptied of it cannot
 * transfer its own tokens out, and nobody but a third party can fix that.
 */
test('a native send may not take the wallet below the gas reserve', () => {
  const problem = describeSendProblem({ ...base, token: 'native', amount: parseEther('0.0999') });
  assert.ok(problem);
  assert.match(problem, /Keep at least/);
  assert.match(problem, /cannot send anything again/);
});

test('sending everything but the reserve is allowed', () => {
  const amount = sendableNative(base.nativeBalance);
  assert.equal(amount, parseEther('0.1') - GAS_RESERVE);
  assert.equal(describeSendProblem({ ...base, token: 'native', amount }), null);
});

test('a token send still needs gas to be signed', () => {
  const problem = describeSendProblem({
    ...base, token: 'payment', amount: parseEther('1'), nativeBalance: 0n,
  });
  assert.ok(problem);
  assert.match(problem, /needs gas/);
});

test('each refusal says which mistake it is', () => {
  assert.match(describeSendProblem({ ...base, token: 'native', amount: parseEther('1'), to: '' })!, /Enter the address/);
  assert.match(describeSendProblem({ ...base, token: 'native', amount: parseEther('1'), to: 'not-an-address' })!, /not a valid address/);
  assert.match(describeSendProblem({ ...base, token: 'native', amount: 0n })!, /greater than zero/);
  assert.match(describeSendProblem({ ...base, token: 'payment', amount: parseEther('99') })!, /holds less than that/);
});

test('an empty or unreadable amount is zero, not a crash', () => {
  assert.equal(parseAmount(''), 0n);
  assert.equal(parseAmount('  '), 0n);
  assert.equal(parseAmount('abc'), 0n);
  assert.equal(parseAmount('1.5'), parseEther('1.5'));
});

test('a wallet at or under the reserve can send no native at all', () => {
  assert.equal(sendableNative(GAS_RESERVE), 0n);
  assert.equal(sendableNative(0n), 0n);
});
