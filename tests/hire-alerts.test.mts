import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM_WALLETS, isTeamWallet } from '../src/lib/alerts/team-wallets';

/**
 * The rule that decides what gets escalated to a human.
 *
 * Wrong in the quiet direction and a real user arrives unnoticed; wrong in
 * the loud direction and the channel gets muted before one does.
 */

test('every declared team wallet is recognised', () => {
  for (const wallet of TEAM_WALLETS) {
    assert.equal(isTeamWallet(wallet), true, `${wallet} was not recognised`);
  }
});

test('casing never decides whether a hire is ours', () => {
  const wallet = TEAM_WALLETS[0];
  assert.equal(isTeamWallet(wallet.toLowerCase()), true);
  assert.equal(isTeamWallet(wallet.toUpperCase().replace('0X', '0x')), true);
});

test('an outside wallet is not treated as ours', () => {
  assert.equal(
    isTeamWallet('0x1111111111111111111111111111111111111111'),
    false,
  );
});

test('the three wallets declared to BNB are the three watched', () => {
  // Pinned against docs/phase-2/tracking.md §5. If that list changes and this
  // does not, hires from a new team wallet would be reported as real users.
  assert.deepEqual(
    [...TEAM_WALLETS].map((w) => w.toLowerCase()).sort(),
    [
      '0x3fb8779f4f42e1800f27aaec9564530bcaa852bf',
      '0x60ef148485c2a5119fa52ca13c52e9fd98f28e87',
      '0xef869bb780a5163e6d39e83817cd29af6deaa784',
    ].sort(),
  );
});

test('rubbish is never silently classified as a team wallet', () => {
  assert.equal(isTeamWallet(''), false);
  assert.equal(isTeamWallet('not-an-address'), false);
  assert.equal(isTeamWallet('0x123'), false);
});
