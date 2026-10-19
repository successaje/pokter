import assert from 'node:assert/strict';
import test from 'node:test';

import { keccak256, stringToBytes } from 'viem';

import { manifestMatch, sortedKeysText } from '../src/lib/erc8183/manifest-match';

const served = JSON.stringify(
  { version: 1, job_id: 1544, chain_id: 97, response: { content: { trades: [], summary: { trades: 0, paused: true } } }, metadata: { producer: 'nagi' } },
  null,
  2,
);
const hash = (text: string) => keccak256(stringToBytes(text));

test('the exact bytes match exactly', () => {
  assert.equal(manifestMatch(served, hash(served)), 'exact');
});

test('a hash of the same JSON with sorted keys matches, and says so', () => {
  const committed = hash(sortedKeysText(served)!);
  assert.notEqual(committed, hash(served));
  assert.equal(manifestMatch(served, committed), 'sorted-keys');
  assert.equal(manifestMatch(served, committed.toUpperCase().replace('0X', '0x')), 'sorted-keys');
});

test('keys are sorted at every depth, and arrays keep their order', () => {
  assert.equal(sortedKeysText('{"b":{"d":1,"c":2},"a":[3,1]}'), '{"a":[3,1],"b":{"c":2,"d":1}}');
});

test('changed content matches neither way', () => {
  const committed = hash(sortedKeysText(served)!);
  const altered = served.replace('"trades": 0', '"trades": 3');
  assert.equal(manifestMatch(altered, committed), null);
});

test('text that is not JSON can only match exactly', () => {
  assert.equal(manifestMatch('plain answer', hash('plain answer')), 'exact');
  assert.equal(manifestMatch('plain answer', hash('other')), null);
  assert.equal(manifestMatch('plain answer', null), null);
});
