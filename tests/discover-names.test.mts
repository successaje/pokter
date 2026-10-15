import assert from 'node:assert/strict';
import test from 'node:test';

import { mainnetFirstPerAgent } from '../src/lib/agents/distinct';
import { closestNames, nameMatch, NAME_MATCH, nameSimilarity } from '../src/lib/search/names';

test('a name ranks by how much of it was typed, from one letter', () => {
  assert.equal(nameMatch('Brinkwatch', 'brinkwatch'), NAME_MATCH.exact);
  assert.equal(nameMatch('Brinkwatch', 'B'), NAME_MATCH.start);
  assert.equal(nameMatch('Pre-trade Token Check', 'tok'), NAME_MATCH.wordStart);
  assert.equal(nameMatch('Sluicegate', 'gate'), NAME_MATCH.contains);
  assert.equal(nameMatch('Sluicegate', 'ga'), NAME_MATCH.none); // under three letters, only starts count
  assert.equal(nameMatch('Keel', 'x'), NAME_MATCH.none);
});

test('a near miss suggests the real name; nonsense suggests nothing', () => {
  const names = ['Brinkwatch', 'Cresthold', 'Keel Vault', 'Sluicegate'];
  assert.deepEqual(closestNames(names, (n) => n, 'brinkwach'), ['Brinkwatch']);
  assert.deepEqual(closestNames(names, (n) => n, 'keel'), ['Keel Vault']);
  assert.deepEqual(closestNames(names, (n) => n, 'zzqxv'), []);
  assert.ok(nameSimilarity('Cresthold', 'crest hold') > 0.8);
});

test('an agent on both networks is shown once, as its mainnet registration, keeping its place', () => {
  const agent = (chain_id: number, token_id: string, name: string, owner = '0xa') => ({ chain_id, token_id, name, owner_address: owner });
  // Ranked order: the testnet twin first (it has a record), then another agent, then the mainnet twin.
  const items = [agent(97, '2618', 'Brinkwatch'), agent(56, '1', 'Other', '0xb'), agent(56, '374107', 'Brinkwatch')];
  const { items: shown, alsoOn } = mainnetFirstPerAgent(items, (a) => a);
  assert.deepEqual(shown.map((a) => `${a.chain_id}/${a.token_id}`), ['56/374107', '56/1']);
  assert.deepEqual(alsoOn.get(shown[0]), [97]);
  assert.equal(alsoOn.has(shown[1]), false);
});
