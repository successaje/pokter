import assert from 'node:assert/strict';
import test from 'node:test';

import { fundedByTeam, TEAM_WALLETS, teamAddressSet } from '../src/lib/team/wallets';

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
  assert.equal(teamAddressSet(['not an address']).size, teamAddressSet().size);
});

test('the published team wallets are valid and counted as the team', () => {
  const published = teamAddressSet();
  assert.equal(published.size, TEAM_WALLETS.length);
  assert.equal(TEAM_WALLETS.length, 6);
  assert.equal(fundedByTeam({ client: '0x60ef148485c2a5119fa52ca13c52e9fd98f28e87' }, published), true);
  assert.equal(fundedByTeam({ client: '0x93847647d7eb72a69e162117df6a8697df53edda' }, published), true);
  assert.equal(fundedByTeam({ client: '0xef869bb780a5163e6d39e83817cd29af6deaa784' }, published), true);
  assert.equal(fundedByTeam({ client: '0x3fb8779f4f42e1800f27aaec9564530bcaa852bf' }, published), true);
  assert.equal(fundedByTeam({ client: '0xce515e144c33edbd1c3320fde0de6373315885ed' }, published), true);
  assert.equal(fundedByTeam({ client: '0xdab12cf15f4385188be62bda9f00877af4c1b32f' }, published), true);
  // Outside builders' wallets are not the team's.
  assert.equal(fundedByTeam({ client: '0x494ae5cf2729e662cc05dbd63d2107d707fd00de' }, published), false);
});
