import assert from 'node:assert/strict';
import test from 'node:test';

import { isThisHire } from '../src/lib/erc8183/hire-confirm';

const CLIENT = '0x93847647d7eb72a69E162117df6a8697dF53EDda';
const RATE_ROUTER = '0x1111111111111111111111111111111111111111';
const YIELD_KEEPER = '0x2222222222222222222222222222222222222222';

test('a predicted id holding another agent’s job is not this hire', () => {
  // 16 October: a fixture hire for one agent was recorded as job 1522, which belonged to the next agent.
  const onchain1522 = { client: CLIENT, provider: YIELD_KEEPER, description: '{"task":"yield usdt-30-days"}' };
  assert.equal(isThisHire(onchain1522, { client: CLIENT, provider: RATE_ROUTER, description: '{"task":"range 0x0622"}' }), false);
  assert.equal(isThisHire(onchain1522, { client: CLIENT, provider: YIELD_KEEPER, description: '{"task":"yield usdt-30-days"}' }), true);
});

test('an empty slot (nothing created) is not this hire', () => {
  const empty = { client: '0x0000000000000000000000000000000000000000', provider: '0x0000000000000000000000000000000000000000', description: '' };
  assert.equal(isThisHire(empty, { client: CLIENT, provider: RATE_ROUTER, description: 'x' }), false);
});
