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

/**
 * The panel's connector choice, as a table. The component cannot be rendered
 * here, but the rule that produced a live button promising a QR code with no
 * relay behind it is one line, and it is the line worth pinning.
 */
function primaryConnector(opts: {
  hasInjectedProvider: boolean;
  walletConnectConfigured: boolean;
}): 'injected' | 'walletConnect' | null {
  const injected = opts.hasInjectedProvider ? 'injected' : null;
  const wc = opts.walletConnectConfigured ? 'walletConnect' : null;
  return injected ?? wc;
}

test('an extension is preferred when one is actually present', () => {
  assert.equal(
    primaryConnector({ hasInjectedProvider: true, walletConnectConfigured: true }),
    'injected',
  );
});

test('a phone with WalletConnect configured gets the relay', () => {
  assert.equal(
    primaryConnector({ hasInjectedProvider: false, walletConnectConfigured: true }),
    'walletConnect',
  );
});

test('no extension and no relay offers nothing rather than a dead button', () => {
  assert.equal(
    primaryConnector({ hasInjectedProvider: false, walletConnectConfigured: false }),
    null,
    'falling back to injected here promises a QR code and connects to nothing',
  );
});
