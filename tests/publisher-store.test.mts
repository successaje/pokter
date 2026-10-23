import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ensureVerifiedPublishers,
  saveVerifiedPublisher,
  verifiedPublisherByOwner,
  VERIFIED_PUBLISHER_TTL_MS,
} from '../src/lib/builders/publisher-store';

/*
 * Against a real file, because the claim being made is about SQL. "A
 * signature stops answering once it is old enough" is a property of a
 * `WHERE` clause, and an in-memory stand-in would prove something about a
 * stand-in.
 *
 * What this table is for: it answers "which agents might this wallet act
 * for" when 8004scan cannot be read, so an assistant is not told "you own
 * no agents" during an indexer outage. What it had become: a row with no
 * expiry, displaced only when the *new* owner happened to verify, handed to
 * a ninety-day headless credential — so one past signature was a standing
 * claim on an identity the wallet may since have transferred away.
 */
function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'pokter-publishers-'));
  const db = new DatabaseSync(join(dir, 'builders.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  ensureVerifiedPublishers(db);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

const A = '0xAAAA000000000000000000000000000000000000' as const;
const B = '0xBBBB000000000000000000000000000000000000' as const;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

test('the schema is created idempotently, as the live database creates it twice', () => {
  const { db, cleanup } = fresh();
  try {
    ensureVerifiedPublishers(db);
    assert.deepEqual(verifiedPublisherByOwner(db, A), []);
  } finally {
    cleanup();
  }
});

test('a signature made just now answers for its identity', () => {
  const { db, cleanup } = fresh();
  try {
    saveVerifiedPublisher(db, { owner: A, chainId: 97, tokenId: '42', signature: '0xsig' });
    const rows = verifiedPublisherByOwner(db, A);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].chainId, 97);
    assert.equal(rows[0].tokenId, '42');
    assert.equal(rows[0].owner, A, 'the owner comes back in the spelling it was asked for');
  } finally {
    cleanup();
  }
});

test('a checksummed and a lower-cased spelling of one wallet are one wallet', () => {
  const { db, cleanup } = fresh();
  try {
    saveVerifiedPublisher(db, { owner: A, chainId: 56, tokenId: '7', signature: '0xsig' });
    assert.equal(verifiedPublisherByOwner(db, A.toLowerCase() as typeof A).length, 1);
  } finally {
    cleanup();
  }
});

/*
 * The fix. A year-old signature is not a permission.
 */
test('a signature older than the TTL stops answering', () => {
  const { db, cleanup } = fresh();
  try {
    saveVerifiedPublisher(db, {
      owner: A, chainId: 97, tokenId: '42', signature: '0xsig',
      verifiedAt: ago(365 * 86_400_000),
    });
    assert.deepEqual(verifiedPublisherByOwner(db, A), [], 'a year-old signature is not a standing grant');
  } finally {
    cleanup();
  }
});

test('the boundary is the TTL itself: a day inside answers, a day outside does not', () => {
  const { db, cleanup } = fresh();
  try {
    saveVerifiedPublisher(db, {
      owner: A, chainId: 97, tokenId: '1', signature: '0xsig',
      verifiedAt: ago(VERIFIED_PUBLISHER_TTL_MS - 86_400_000),
    });
    saveVerifiedPublisher(db, {
      owner: A, chainId: 97, tokenId: '2', signature: '0xsig',
      verifiedAt: ago(VERIFIED_PUBLISHER_TTL_MS + 86_400_000),
    });
    assert.deepEqual(verifiedPublisherByOwner(db, A).map((r) => r.tokenId), ['1']);
  } finally {
    cleanup();
  }
});

test('the expiry is read at call time, not frozen when the row was written', () => {
  const { db, cleanup } = fresh();
  try {
    const at = ago(VERIFIED_PUBLISHER_TTL_MS - 60_000);
    saveVerifiedPublisher(db, { owner: A, chainId: 97, tokenId: '42', signature: '0xsig', verifiedAt: at });
    assert.equal(verifiedPublisherByOwner(db, A).length, 1, 'inside the window now');
    assert.equal(
      verifiedPublisherByOwner(db, A, Date.now() + 120_000).length,
      0,
      'the same row, two minutes later, is outside it',
    );
  } finally {
    cleanup();
  }
});

test('an expired row is left in place, so verifying again revives the identity', () => {
  const { db, cleanup } = fresh();
  try {
    saveVerifiedPublisher(db, {
      owner: A, chainId: 97, tokenId: '42', signature: '0xold',
      verifiedAt: ago(200 * 86_400_000),
    });
    assert.deepEqual(verifiedPublisherByOwner(db, A), []);
    saveVerifiedPublisher(db, { owner: A, chainId: 97, tokenId: '42', signature: '0xnew' });
    assert.equal(verifiedPublisherByOwner(db, A).length, 1, 'one signature at /build and it answers again');
    const count = db.prepare('SELECT COUNT(*) AS n FROM verified_publishers').get() as { n: number };
    assert.equal(count.n, 1, 'and it is still one row per identity');
  } finally {
    cleanup();
  }
});

test('one wallet’s signature never answers for another', () => {
  const { db, cleanup } = fresh();
  try {
    saveVerifiedPublisher(db, { owner: A, chainId: 97, tokenId: '42', signature: '0xsig' });
    assert.deepEqual(verifiedPublisherByOwner(db, B), []);
  } finally {
    cleanup();
  }
});

/*
 * The displacement that used to be the only thing retiring a row. It still
 * works, and the point of the TTL is that it is no longer what the
 * protection depends on: B may never verify at all.
 */
test('a new owner verifying displaces the old owner’s row — and the TTL does not need them to', () => {
  const { db, cleanup } = fresh();
  try {
    saveVerifiedPublisher(db, { owner: A, chainId: 97, tokenId: '42', signature: '0xa' });
    saveVerifiedPublisher(db, { owner: B, chainId: 97, tokenId: '42', signature: '0xb' });
    assert.deepEqual(verifiedPublisherByOwner(db, A), [], 'displaced');
    assert.equal(verifiedPublisherByOwner(db, B).length, 1);
  } finally {
    cleanup();
  }
});

test('the TTL is the one this repository decided on, and is a month rather than a session', () => {
  // Named here so changing it is a deliberate edit to a test, not a silent
  // widening of how long a signature alone speaks for an identity.
  assert.equal(VERIFIED_PUBLISHER_TTL_MS, 30 * 86_400_000);
  assert.ok(VERIFIED_PUBLISHER_TTL_MS > 7 * 86_400_000, 'longer than a builder session, which is re-signed in a browser');
});
