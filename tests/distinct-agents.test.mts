import assert from 'node:assert/strict';
import test from 'node:test';

import { distinctAgentCount, firstPerAgent } from '../src/lib/agents/distinct';

const OWNER = '0xDF1074a272c53a1a10b96fa0201eb58bbbaafe00';

test('one agent registered on both chains counts once', () => {
  // Keel, as listed: 97/2238 and 56/341556 under the same owner.
  assert.equal(
    distinctAgentCount([
      { owner_address: OWNER, name: 'Keel', chain_id: 97, token_id: '2238' },
      { owner_address: OWNER.toLowerCase(), name: ' keel ', chain_id: 56, token_id: '341556' },
    ]),
    1,
  );
});

test('the same name from different owners, or unnamed agents, stay separate', () => {
  assert.equal(
    distinctAgentCount([
      { owner_address: OWNER, name: 'Keel', chain_id: 97, token_id: '1' },
      { owner_address: '0x253f7ad5d52099c4a2293418a661e9974dfb5e84', name: 'Keel', chain_id: 56, token_id: '2' },
      { owner_address: OWNER, name: '', chain_id: 97, token_id: '3' },
      { owner_address: OWNER, name: null, chain_id: 56, token_id: '4' },
    ]),
    4,
  );
});

test('a list keeps the first registration of each agent, in order', () => {
  const rows = [
    { id: 'keel-56', agent: { owner_address: OWNER, name: 'Keel', chain_id: 56, token_id: '341556' } },
    { id: 'other', agent: { owner_address: '0x1', name: 'Other', chain_id: 97, token_id: '9' } },
    { id: 'keel-97', agent: { owner_address: OWNER, name: 'Keel', chain_id: 97, token_id: '2238' } },
  ];
  assert.deepEqual(firstPerAgent(rows, (row) => row.agent).map((row) => row.id), ['keel-56', 'other']);
});
