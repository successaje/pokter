import assert from 'node:assert/strict';
import test from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage } from 'viem';

import { coverage, STALE_AFTER_MS } from '../src/lib/trading/coverage';
import { normaliseOwners, ownersMessage, ownersSignatureProblem, OWNERS_SIGNATURE_TTL_MS } from '../src/lib/trading/owners';

const trader = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const stranger = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
const OWN = '0x00000000000000000000000000000000000000aa';
const now = Date.parse('2026-10-21T12:00:00Z');

test('the same list always signs the same text: sorted, lower-case, deduplicated, without the wallet', () => {
  const a = normaliseOwners(trader.address, [OWN.toUpperCase().replace('0X', '0x'), '0x00000000000000000000000000000000000000BB', OWN, trader.address]);
  assert.deepEqual(a, ['0x00000000000000000000000000000000000000aa', '0x00000000000000000000000000000000000000bb']);
  assert.equal(normaliseOwners(trader.address, ['not an address']), null);
  assert.equal(normaliseOwners(trader.address, Array.from({ length: 6 }, (_, i) => `0x${String(i + 1).padStart(40, '0')}`)), null);
});

test('only the watched wallet’s own signature matches the owner message', async () => {
  const message = ownersMessage({ wallet: trader.address, owners: [OWN], issuedAt: '2026-10-21T11:59:00Z' });
  assert.match(message, new RegExp(trader.address.toLowerCase()));
  assert.match(message, new RegExp(OWN));
  assert.equal(await verifyMessage({ address: trader.address, message, signature: await trader.signMessage({ message }) }), true);
  // A stranger signing the same list for somebody else's wallet does not pass.
  assert.equal(await verifyMessage({ address: trader.address, message, signature: await stranger.signMessage({ message }) }), false);
  // A signature over one list does not cover another.
  const other = ownersMessage({ wallet: trader.address, owners: [OWN, '0x00000000000000000000000000000000000000bb'], issuedAt: '2026-10-21T11:59:00Z' });
  assert.equal(await verifyMessage({ address: trader.address, message: other, signature: await trader.signMessage({ message }) }), false);
});

test('a signature must be recent, not from the future, and newer than the saved list', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  assert.equal(ownersSignatureProblem({ issuedAt: iso(now - 60_000), now, lastSignedAt: null }), null);
  assert.match(ownersSignatureProblem({ issuedAt: iso(now - OWNERS_SIGNATURE_TTL_MS - 1), now, lastSignedAt: null })!, /expired/);
  assert.match(ownersSignatureProblem({ issuedAt: iso(now + 5 * 60_000), now, lastSignedAt: null })!, /future/);
  assert.match(ownersSignatureProblem({ issuedAt: iso(now - 120_000), now, lastSignedAt: iso(now - 60_000) })!, /newer/);
  assert.match(ownersSignatureProblem({ issuedAt: 'yesterday', now, lastSignedAt: null })!, /time/);
});

test('only a recent, successful scan may say nothing was found', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  assert.equal(coverage(null, now).state, 'unwatched');
  assert.deepEqual(coverage({ lastScanAt: null, lastError: null, scannedTo: null }, now), { state: 'never-scanned', failed: false });
  assert.deepEqual(coverage({ lastScanAt: iso(now), lastError: 'boom', scannedTo: null }, now), { state: 'never-scanned', failed: true });
  assert.equal(coverage({ lastScanAt: iso(now), lastError: 'RPC down', scannedTo: 100 }, now).state, 'failing');
  assert.equal(coverage({ lastScanAt: iso(now - STALE_AFTER_MS - 1), lastError: null, scannedTo: 100 }, now).state, 'stale');
  assert.equal(coverage({ lastScanAt: iso(now - 60_000), lastError: null, scannedTo: 100 }, now).state, 'current');
});

test('coverage never carries error text to the page', () => {
  const c = coverage({ lastScanAt: new Date(now).toISOString(), lastError: 'fetch https://rpc.example/key-123 failed', scannedTo: 100 }, now);
  assert.doesNotMatch(JSON.stringify(c), /key-123|rpc\.example/);
});

test('a wallet still catching up after a capped scan is not current', () => {
  const recent = new Date(now - 60_000).toISOString();
  assert.equal(coverage({ lastScanAt: recent, lastError: null, scannedTo: 1_000 }, now, 1_500).state, 'current');
  assert.equal(coverage({ lastScanAt: recent, lastError: null, scannedTo: 1_000 }, now, 5_000).state, 'behind');
});
