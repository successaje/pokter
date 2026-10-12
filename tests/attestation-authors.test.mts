import assert from 'node:assert/strict';
import test from 'node:test';

import { isTeamWallet, TEAM_WALLETS } from '../src/lib/alerts/team-wallets';

/*
 * The attestation author resolver itself reads transactions, so what is
 * pinned here is the rule it applies: a Pokter wallet never counts as
 * independent of Pokter. The resolver asks exactly this question of each
 * row's sender, so a wallet that stopped being recognised here would
 * silently start counting as a third party.
 */
test('every declared team wallet is recognised, whatever its casing', () => {
  assert.ok(TEAM_WALLETS.length > 0, 'the declaration is not empty');
  for (const wallet of TEAM_WALLETS) {
    assert.equal(isTeamWallet(wallet), true, wallet);
    assert.equal(isTeamWallet(wallet.toLowerCase()), true, wallet);
    assert.equal(isTeamWallet(wallet.toUpperCase().replace('0X', '0x')), true, wallet);
  }
});

test('the retired demo seller still counts as Pokter', () => {
  /* It transacted, so its attestations exist and must stay disclosed even
     though the key is no longer used. */
  assert.equal(isTeamWallet('0x60eF148485C2a5119fa52CA13c52E9fd98F28e87'), true);
});

test('a stranger is not Pokter', () => {
  assert.equal(isTeamWallet('0x000000000000000000000000000000000000dEaD'), false);
  assert.equal(isTeamWallet('not an address'), false);
  assert.equal(isTeamWallet(''), false);
});
