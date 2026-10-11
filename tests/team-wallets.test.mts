import assert from 'node:assert/strict';
import test from 'node:test';

import { fundedByTeam, teamAddressSet } from '../src/lib/team/wallets';

const team = teamAddressSet(['0x60EF148485c2a5119fa52ca13c52e9fd98f28e87']);

test('team membership ignores address case', () => {
  assert.equal(fundedByTeam({ client: '0x60ef148485c2a5119fa52ca13c52e9fd98f28e87' }, team), true);
  assert.equal(fundedByTeam({ client: '0x494ae5cf2729e662cc05dbd63d2107d707fd00de' }, team), false);
});

test('a job with no recorded funder is a legacy operator hire', () => {
  assert.equal(fundedByTeam({ client: null }, team), true);
  assert.equal(fundedByTeam({}, team), true);
});

test('unreadable addresses are dropped from the set rather than matching everything', () => {
  assert.equal(teamAddressSet(['not an address']).size, 0);
});
