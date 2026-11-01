import assert from 'node:assert/strict';
import test from 'node:test';

import { mainnetFirstPerAgent } from '../src/lib/agents/distinct';
import { hireChainIdsOf, hireNetworkTags } from '../src/lib/network/hire-networks';

/*
 * Cards say where a hire settles as "Mainnet" or "Testnet". Every agent
 * here is on BNB Chain, so the chain's name carried nothing; what the money
 * is stays in the tooltip and the screen-reader text.
 */

test('each network is one short label, with what its money is kept beside it', () => {
  assert.deepEqual(hireNetworkTags([56]), [{ chainId: 56, label: 'Mainnet', real: true, meaning: 'Hired with real funds' }]);
  assert.deepEqual(hireNetworkTags([97]), [{ chainId: 97, label: 'Testnet', real: false, meaning: 'Hired with test tokens, which have no value' }]);
});

test('an agent hireable on both reads mainnet first, each network once', () => {
  assert.deepEqual(hireNetworkTags([97, 56, 97]).map((tag) => tag.label), ['Mainnet', 'Testnet']);
  assert.deepEqual(hireNetworkTags([56, 97]).map((tag) => tag.label), ['Mainnet', 'Testnet']);
});

test('no network, or one Pokter does not know, claims nothing', () => {
  assert.deepEqual(hireNetworkTags([]), []);
  assert.deepEqual(hireNetworkTags([null]), []);
  assert.deepEqual(hireNetworkTags([1]), [], 'an unknown chain is never guessed to be test or real money');
});

test('a registration counts as a way to hire only where it has a verified price', () => {
  // The card's own registration on mainnet, a priced twin on testnet: both.
  assert.deepEqual(hireChainIdsOf(56, [97]), [56, 97]);
  // A testnet twin with no price of its own adds nothing.
  assert.deepEqual(hireChainIdsOf(56, [null]), [56]);
  // A testnet-only agent.
  assert.deepEqual(hireChainIdsOf(97, []), [97]);
});

test('grouping an agent keeps its other registrations, so a row can read their prices', () => {
  const rows = [
    { agent: { chain_id: 97, token_id: '2618', owner_address: '0xB7', name: 'Brinkwatch by Pokter' } },
    { agent: { chain_id: 56, token_id: '374107', owner_address: '0xB7', name: 'Brinkwatch by Pokter' } },
    { agent: { chain_id: 56, token_id: '1', owner_address: '0xA1', name: 'Solo' } },
  ];
  const { items, alsoOn, others } = mainnetFirstPerAgent(rows, (row) => row.agent as never);
  assert.deepEqual(items.map((row) => `${row.agent.chain_id}:${row.agent.token_id}`), ['56:374107', '56:1']);
  assert.deepEqual(alsoOn.get(items[0]), [97]);
  assert.deepEqual(others.get(items[0])?.map((row) => row.agent.token_id), ['2618']);
  assert.equal(others.has(items[1]), false);
});
