import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { ensureWatchedWallets, readOwnerList, recordSignedOwners, watchWallet, type OwnerListWrite } from '../src/lib/trading/owner-list';
import { ownersSignatureProblem, ownersSignedAtMs, ownersUpdateSupersedes } from '../src/lib/trading/owners';

/*
 * The owner list is the one address set money may leave for without an
 * alert, so the list that survives has to be the newest one the wallet
 * signed. It was not.
 *
 * `/api/trading/owners` read `owners_signed_at`, judged the request against
 * that snapshot, verified the signature across two awaits, and then wrote
 * `UPDATE trading_wallets SET owners = ?, owners_signed_at = ? WHERE
 * wallet = ?`. Two accepted requests overlapping in those awaits were both
 * judged against the same snapshot and both wrote; the one that finished
 * last won, whichever was signed first. An owner who removed an address
 * could have it put back by their own earlier request, and a drain to it
 * would then raise nothing.
 *
 * These run the real SQL against a real database file, because that race
 * leaves no trace in types, lint or the build. The route cannot be imported
 * — it is `server-only` — so `request` below is its order: read, judge,
 * await verification, write. What makes the test worth having is that the
 * awaits are resolved out of order, the way the network resolves them.
 */

const WALLET = '0x00000000000000000000000000000000000000ff';
const KEPT = '0x00000000000000000000000000000000000000aa';
const REMOVED = '0x00000000000000000000000000000000000000bb';
const NOW = Date.parse('2026-10-21T12:00:00Z');
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function openStore(t: { after: (fn: () => void) => void }): DatabaseSync {
  const directory = mkdtempSync(join(tmpdir(), 'pokter-trading-owners-'));
  const db = new DatabaseSync(join(directory, 'trading.db'));
  db.exec('PRAGMA journal_mode = WAL');
  ensureWatchedWallets(db);
  watchWallet(db, { wallet: WALLET, agentKey: null, addedAt: iso(-3_600_000) });
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return db;
}

interface Attempt {
  owners: string[];
  issuedAt: string;
  /** Resolves when this request's signature check comes back. */
  verified: Promise<void>;
  /** False stands in for `signedByWallet` saying no. */
  signatureHolds?: boolean;
}

type Outcome = OwnerListWrite | 'refused' | 'bad-signature';

/** One request in the route's own order, with its verification awaited. */
async function request(db: DatabaseSync, attempt: Attempt): Promise<Outcome> {
  const recorded = readOwnerList(db, WALLET);
  if (ownersSignatureProblem({ issuedAt: attempt.issuedAt, now: NOW, lastSignedAt: recorded?.signedAt ?? null })) return 'refused';
  await attempt.verified;
  if (attempt.signatureHolds === false) return 'bad-signature';
  return recordSignedOwners(db, { wallet: WALLET, owners: attempt.owners, signedAt: attempt.issuedAt });
}

test('the older of two overlapping requests cannot land on top of the newer', async (t) => {
  const db = openStore(t);
  const older = iso(-120_000);
  const newer = iso(-30_000);

  /* Both requests read before either writes — the route does its read, its
     check and its first await before any write can happen — and then B's
     verification comes back after A has already written. */
  let releaseB = (): void => {};
  const bVerified = new Promise<void>((resolve) => {
    releaseB = resolve;
  });
  const a = request(db, { owners: [KEPT], issuedAt: newer, verified: Promise.resolve() });
  const b = request(db, { owners: [REMOVED], issuedAt: older, verified: bVerified });

  assert.equal(await a, 'applied');
  assert.deepEqual(readOwnerList(db, WALLET)!.owners, [KEPT], 'the newer list should be saved before B comes back');
  releaseB();

  assert.equal(await b, 'not-newer', 'an authorised but older list must be dropped, not written');
  assert.deepEqual(readOwnerList(db, WALLET)!.owners, [KEPT], 'the newer list must survive the older write');
  assert.equal(readOwnerList(db, WALLET)!.signedAt, newer);

  /* The check on arrival could not have caught this: when B read, nothing
     newer was saved, so it was authorised. Only the guard on the write saw
     it, which is why the guard has to be on the write. */
  assert.equal(ownersSignatureProblem({ issuedAt: older, now: NOW, lastSignedAt: null }), null);
});

test('the same request twice writes once and leaves the list alone', async (t) => {
  const db = openStore(t);
  const issuedAt = iso(-30_000);

  assert.equal(await request(db, { owners: [KEPT], issuedAt, verified: Promise.resolve() }), 'applied');
  /* A double submit, or a retry of a response that was lost: the second
     carries the same signed time, so it is not newer and does nothing. */
  assert.equal(recordSignedOwners(db, { wallet: WALLET, owners: [REMOVED], signedAt: issuedAt }), 'not-newer');
  assert.deepEqual(readOwnerList(db, WALLET)!.owners, [KEPT]);
});

test('a replayed older signature is dropped by the write as well as on arrival', async (t) => {
  const db = openStore(t);
  const first = iso(-300_000);
  const second = iso(-30_000);

  assert.equal(await request(db, { owners: [REMOVED], issuedAt: first, verified: Promise.resolve() }), 'applied');
  assert.equal(await request(db, { owners: [KEPT], issuedAt: second, verified: Promise.resolve() }), 'applied');

  /* Replaying the first capture, which still names the removed address. */
  assert.equal(await request(db, { owners: [REMOVED], issuedAt: first, verified: Promise.resolve() }), 'refused');
  assert.equal(recordSignedOwners(db, { wallet: WALLET, owners: [REMOVED], signedAt: first }), 'not-newer');
  assert.deepEqual(readOwnerList(db, WALLET)!.owners, [KEPT]);
});

test('a signature that does not hold changes nothing', async (t) => {
  const db = openStore(t);
  const issuedAt = iso(-60_000);
  assert.equal(await request(db, { owners: [KEPT], issuedAt, verified: Promise.resolve() }), 'applied');

  const before = readOwnerList(db, WALLET);
  assert.equal(
    await request(db, { owners: [REMOVED], issuedAt: iso(-10_000), verified: Promise.resolve(), signatureHolds: false }),
    'bad-signature',
  );
  assert.deepEqual(readOwnerList(db, WALLET), before, 'a rejected signature must not move the list or its time');
});

test('the list is written to the file, not just to the handle', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pokter-trading-owners-'));
  const path = join(directory, 'trading.db');
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const first = new DatabaseSync(path);
  first.exec('PRAGMA journal_mode = WAL');
  ensureWatchedWallets(first);
  watchWallet(first, { wallet: WALLET, agentKey: null, addedAt: iso(-3_600_000) });
  assert.equal(recordSignedOwners(first, { wallet: WALLET, owners: [KEPT], signedAt: iso(-60_000) }), 'applied');
  first.close();

  /* Reopened: the migration must find its own columns and leave the list
     where it is, and the ordering key must still refuse an older write. */
  const second = new DatabaseSync(path);
  ensureWatchedWallets(second);
  assert.deepEqual(readOwnerList(second, WALLET)!.owners, [KEPT]);
  assert.equal(recordSignedOwners(second, { wallet: WALLET, owners: [REMOVED], signedAt: iso(-120_000) }), 'not-newer');
  assert.deepEqual(readOwnerList(second, WALLET)!.owners, [KEPT]);
  second.close();
});

test('a list is never written against a wallet nobody is watching', (t) => {
  const db = openStore(t);
  const stranger = '0x00000000000000000000000000000000000000cc';
  assert.equal(recordSignedOwners(db, { wallet: stranger, owners: [KEPT], signedAt: iso(-30_000) }), 'not-watched');
  assert.equal(readOwnerList(db, stranger), null, 'the write must not bring the row into being');
});

test('a wallet watched before the ordering key existed is still ordered', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pokter-trading-owners-'));
  const db = new DatabaseSync(join(directory, 'trading.db'));
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  /* The table as it stood when owner lists were unsigned text, plus the
     column the signed lists added. A row left without `owners_signed_ms`
     would have accepted the next signature however old it was. */
  db.exec(`CREATE TABLE trading_wallets (
    wallet TEXT PRIMARY KEY, agent_key TEXT, owners TEXT NOT NULL DEFAULT '[]', added_at TEXT NOT NULL,
    scanned_to INTEGER, last_scan_at TEXT, last_error TEXT, owners_signed_at TEXT)`);
  db.prepare('INSERT INTO trading_wallets (wallet, owners, added_at, owners_signed_at) VALUES (?, ?, ?, ?)').run(
    WALLET,
    JSON.stringify([KEPT]),
    iso(-3_600_000),
    iso(-60_000),
  );

  ensureWatchedWallets(db);
  assert.equal(recordSignedOwners(db, { wallet: WALLET, owners: [REMOVED], signedAt: iso(-120_000) }), 'not-newer');
  assert.deepEqual(readOwnerList(db, WALLET)!.owners, [KEPT]);
  assert.equal(recordSignedOwners(db, { wallet: WALLET, owners: [REMOVED], signedAt: iso(-10_000) }), 'applied');
});

test('an unreadable signed time never wins and never clears the ordering key', (t) => {
  const db = openStore(t);
  assert.equal(recordSignedOwners(db, { wallet: WALLET, owners: [KEPT], signedAt: iso(-60_000) }), 'applied');
  /* `ownersSignatureProblem` refuses this on arrival; the write refuses it
     too, because storing a null ordering key would hand the next older
     signature a clean slate. */
  assert.equal(recordSignedOwners(db, { wallet: WALLET, owners: [REMOVED], signedAt: 'yesterday' }), 'not-newer');
  assert.deepEqual(readOwnerList(db, WALLET)!.owners, [KEPT]);
  assert.equal(recordSignedOwners(db, { wallet: WALLET, owners: [REMOVED], signedAt: iso(-120_000) }), 'not-newer');
});

test('the write and the check on arrival agree about which list is newer', (t) => {
  const db = openStore(t);
  /* Two statements of one rule drift apart silently, so they are driven
     over the same pairs. An offset is in there because the client sends
     whatever its device produces, and ordering the text would put
     13:00+01:00 after 12:30Z when it is half an hour earlier. */
  const pairs: Array<[recorded: string, candidate: string]> = [
    [iso(-120_000), iso(-30_000)],
    [iso(-30_000), iso(-120_000)],
    [iso(-30_000), iso(-30_000)],
    ['2026-10-21T13:00:00+01:00', '2026-10-21T12:30:00Z'],
    ['2026-10-21T12:30:00Z', '2026-10-21T13:00:00+01:00'],
  ];

  for (const [recorded, candidate] of pairs) {
    const expected = ownersUpdateSupersedes(ownersSignedAtMs(candidate)!, ownersSignedAtMs(recorded));
    db.prepare('UPDATE trading_wallets SET owners = ?, owners_signed_at = ?, owners_signed_ms = ? WHERE wallet = ?').run(
      JSON.stringify([KEPT]),
      recorded,
      ownersSignedAtMs(recorded)!,
      WALLET,
    );
    const written = recordSignedOwners(db, { wallet: WALLET, owners: [REMOVED], signedAt: candidate });
    assert.equal(written === 'applied', expected, `${candidate} against ${recorded}`);
    assert.deepEqual(readOwnerList(db, WALLET)!.owners, expected ? [REMOVED] : [KEPT]);
  }
});
