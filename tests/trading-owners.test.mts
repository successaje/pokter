import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage } from 'viem';

import { coverage, STALE_AFTER_MS } from '../src/lib/trading/coverage';
import {
  normaliseOwners,
  ownersAlreadyRecorded,
  ownersMessage,
  ownersSignatureProblem,
  ownersSignedAtMs,
  ownersUpdateSupersedes,
  OWNERS_SIGNATURE_TTL_MS,
} from '../src/lib/trading/owners';

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

test('signed lists are ordered by the instant, not by the text', () => {
  /* The client sends whatever its device produces. `Date.parse` reads the
     offset, so these two are half an hour apart in the order the text does
     not give: 13:00+01:00 is 12:00Z. */
  assert.ok(ownersSignedAtMs('2026-10-21T13:00:00+01:00')! < ownersSignedAtMs('2026-10-21T12:30:00Z')!);
  assert.ok('2026-10-21T13:00:00+01:00' > '2026-10-21T12:30:00Z', 'as text it sorts the other way, which is the trap');
  assert.equal(ownersSignedAtMs('yesterday'), null);
  assert.equal(ownersSignedAtMs(null), null);
  assert.equal(ownersSignedAtMs(''), null);
});

test('a list replaces one recorded earlier, and nothing else', () => {
  assert.equal(ownersUpdateSupersedes(now, null), true, 'nothing recorded, so anything the wallet signed wins');
  assert.equal(ownersUpdateSupersedes(now, now - 1), true);
  // Equal is a request arriving twice, not a newer list.
  assert.equal(ownersUpdateSupersedes(now, now), false);
  assert.equal(ownersUpdateSupersedes(now - 1, now), false);
});

/*
 * The route cannot be imported — it is `server-only` — and the fault was
 * its order: it checked, then verified, then wrote without asking again.
 * `tests/trading-owner-list.test.mts` runs the guard for real; these hold
 * the route to using it, because a passing guard nobody reads is no guard.
 */
const ownersRoute = readFileSync(new URL('../src/app/api/trading/owners/route.ts', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

test('the owners route verifies the signature before it writes', () => {
  const verifies = ownersRoute.indexOf('signedByWallet(');
  const writes = ownersRoute.indexOf('setOwners(');
  assert.ok(verifies > 0 && writes > 0, 'both steps must still be in the route');
  assert.ok(verifies < writes, 'a list must never be applied and then checked');
});

test('the owners route reads the answer the write gives it', () => {
  // `store.setOwners(...)` on its own line was the defect: the write's
  // verdict was thrown away, so a dropped list looked like a saved one.
  assert.doesNotMatch(ownersRoute, /^\s*store\.setOwners\(/m);
  assert.match(ownersRoute, /=\s*store\.setOwners\(/);
  assert.match(ownersRoute, /'not-newer'/);
  assert.match(ownersRoute, /'not-watched'/);
});

test('a retry asking for exactly what is saved is recognised as already saved', () => {
  const at = new Date(now).toISOString();
  const saved = { owners: ['0x00000000000000000000000000000000000000aa'], signedAt: at };
  assert.equal(ownersAlreadyRecorded(saved, { owners: ['0x00000000000000000000000000000000000000aa'], issuedAt: at }), true);
  // The same instant written another way is the same instant.
  assert.equal(
    ownersAlreadyRecorded({ owners: [], signedAt: '2026-10-21T13:00:00+01:00' }, { owners: [], issuedAt: '2026-10-21T12:00:00Z' }),
    true,
  );
  // A different list at the same time is not a retry, it is a conflict.
  assert.equal(ownersAlreadyRecorded(saved, { owners: ['0x00000000000000000000000000000000000000bb'], issuedAt: at }), false);
  assert.equal(ownersAlreadyRecorded(saved, { owners: [], issuedAt: at }), false);
  // Nor is the same list signed at a different time.
  assert.equal(ownersAlreadyRecorded(saved, { owners: saved.owners, issuedAt: new Date(now - 1000).toISOString() }), false);
  // Nothing saved, and an unreadable time, are not retries of anything.
  assert.equal(ownersAlreadyRecorded(null, { owners: [], issuedAt: at }), false);
  assert.equal(ownersAlreadyRecorded({ owners: [], signedAt: null }, { owners: [], issuedAt: at }), false);
  assert.equal(ownersAlreadyRecorded(saved, { owners: saved.owners, issuedAt: 'yesterday' }), false);
});

test('the owners route answers its own retry with the list, not a conflict', () => {
  /* The retry reaches the write (the staleness refusal is lifted for it) and
     the write still drops it, because an equal time is not newer. What the
     caller is told is decided by reading back: the state it asked for is the
     state there is, so that is success, not 409. */
  assert.match(ownersRoute, /ownersAlreadyRecorded\(/);
  assert.match(ownersRoute, /lastSignedAt: retry \? null : watched\.ownersSignedAt/);
  const recognises = ownersRoute.lastIndexOf('ownersAlreadyRecorded(');
  assert.ok(recognises > ownersRoute.indexOf('store.setOwners('), 'the retry is only answered after the write has had its say');
});

test('the trading routes name the chain they verify on', () => {
  // Two bare 56s in a signature check were the only hardcoded chain ids left
  // in the repo, and this project has paid twice for a one-chain assumption.
  assert.doesNotMatch(ownersRoute, /signedByWallet\(56|walletCanBeChecked\(56/);
  assert.match(ownersRoute, /walletCanBeChecked\(TRADING_CHAIN_ID/);
  assert.match(ownersRoute, /signedByWallet\(TRADING_CHAIN_ID/);
});

test('the panel shows the list that won when its own change is refused', () => {
  /* The refusal carries the saved list, and the addresses on screen are then
     wrong. Reading `body.owners` was dead weight until the panel used it. */
  const panel = readFileSync(new URL('../src/features/trading/TradingWatchPanel.tsx', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(panel, /owners\?: string\[\]/, 'the refusal body carries a list');
  assert.match(panel, /if \(body\.owners\) onSaved\(\)/, 'a refusal that names a list must reload the one in force');
});

test('the owner list is only ever written through the guard', () => {
  const ownerList = readFileSync(new URL('../src/lib/trading/owner-list.ts', import.meta.url), 'utf8');
  assert.match(ownerList, /owners_signed_ms IS NULL OR owners_signed_ms < :signedMs/, 'the guard belongs inside the UPDATE');
  const store = readFileSync(new URL('../src/lib/trading/store.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(store, /UPDATE trading_wallets SET owners\b/, 'the store must not write the list past the guard');
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
