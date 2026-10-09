import assert from 'node:assert/strict';
import test from 'node:test';

import { wagmiConfig, walletConnectProjectId } from '../src/lib/wallet/config';

test('a missing or blank project id counts as absent', () => {
  assert.equal(walletConnectProjectId(undefined), null);
  assert.equal(walletConnectProjectId(''), null);
  assert.equal(
    walletConnectProjectId('   '),
    null,
    'an empty string would reach the relay and fail at connect time instead',
  );
});

test('a real project id is taken, trimmed', () => {
  assert.equal(walletConnectProjectId('0123456789abcdef'), '0123456789abcdef');
  assert.equal(walletConnectProjectId('  0123456789abcdef \n'), '0123456789abcdef');
});

test('the injected connector is present whatever the environment says', () => {
  const ids = wagmiConfig.connectors.map((connector) => connector.id);
  assert.ok(
    ids.includes('injected'),
    'desktop extensions must keep working when WalletConnect is unconfigured',
  );
});
