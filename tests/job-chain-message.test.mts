import assert from 'node:assert/strict';
import test from 'node:test';

import { missingJobMessage, otherJobChain } from '../src/lib/jobs/href';

test('a job found on the other chain names it rather than the number', () => {
  /*
   * The real case: `/api/jobs/56997` with no `?chain=` defaulted to
   * testnet and answered "Check the number." 56997 is a real mainnet job
   * with a delivered file; nothing about the number was wrong.
   */
  const msg = missingJobMessage('56997', 97, 56);
  assert.match(msg, /on BNB Chain, not BNB Testnet/);
  assert.match(msg, /\?chain=56/);
  assert.doesNotMatch(msg, /check the number/i, 'the number was right');
});

test('the other direction reads the same way', () => {
  const msg = missingJobMessage('1446', 56, 97);
  assert.match(msg, /on BNB Testnet, not BNB Chain/);
  assert.match(msg, /\?chain=97/);
});

test('a job on neither chain still says which was searched', () => {
  const msg = missingJobMessage('999999999', 97, null);
  assert.match(msg, /BNB Testnet \(chain 97\)/, 'names the chain it looked on');
  assert.match(msg, /56.*97|97.*56/s, 'says both chains exist');
  assert.match(msg, /check the number/i, 'and only here is the number in doubt');
});

test('found on the chain we searched is not a "did you mean"', () => {
  // Defensive: the caller should not reach this, and if it does the
  // message must not tell someone to re-ask for the chain they used.
  const msg = missingJobMessage('1', 56, 56);
  assert.doesNotMatch(msg, /not BNB Chain/);
  assert.match(msg, /No job 1 exists on BNB Chain/);
});

test('otherJobChain pairs the two escrows', () => {
  assert.equal(otherJobChain(56), 97);
  assert.equal(otherJobChain(97), 56);
});
