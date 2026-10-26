import assert from 'node:assert/strict';
import test from 'node:test';

import { mainnetFirstPerAgent } from '../src/lib/agents/distinct';
import { closestNames, nameMatch, NAME_MATCH, nameSimilarity, parseAgentId, placeNameMatches } from '../src/lib/search/names';

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

test('an exact agent name leads even when its words read as a task', () => {
  const nameOf = (n: string) => n;
  // "BSC Yield Router" reads as a yield task; the yield agents are the pool's matches.
  const pool = ['Yield Agent One', 'Yield Agent Two', 'Vault Yield'];
  const byName = ['Router Yield Helper', 'BSC Yield Router'];
  assert.deepEqual(
    placeNameMatches(pool, byName, { nameOf, query: 'BSC Yield Router', taskRecognised: true }),
    ['BSC Yield Router', 'Yield Agent One', 'Yield Agent Two', 'Vault Yield', 'Router Yield Helper'],
  );
  // Not a recognised task: name results lead, the exact one first.
  assert.deepEqual(
    placeNameMatches(pool, byName, { nameOf, query: 'bsc yield router', taskRecognised: false }),
    ['BSC Yield Router', 'Router Yield Helper', 'Yield Agent One', 'Yield Agent Two', 'Vault Yield'],
  );
  // No exact name: the old placement, unchanged.
  assert.deepEqual(placeNameMatches(pool, ['Router Yield Helper'], { nameOf, query: 'yield router', taskRecognised: true }), [...pool, 'Router Yield Helper']);
});

test('an agent ID is read as an ID, and a number inside a task is not', () => {
  assert.deepEqual(parseAgentId('342378'), { chainId: null, tokenId: '342378' });
  assert.deepEqual(parseAgentId('#342378'), { chainId: null, tokenId: '342378' });
  assert.deepEqual(parseAgentId(' 56/342378 '), { chainId: 56, tokenId: '342378' });
  assert.deepEqual(parseAgentId('97:2618'), { chainId: 97, tokenId: '2618' });
  assert.deepEqual(parseAgentId('0042'), { chainId: null, tokenId: '42' });
  assert.equal(parseAgentId('1/342378'), null, 'not a listed chain');
  assert.equal(parseAgentId('health factor above 1.5'), null);
  assert.equal(parseAgentId('cfo'), null);
});
