import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  countLiveAutomationTokens,
  ensureAutomationTokens,
  insertAutomationToken,
  listAutomationTokens,
  liveAutomationToken,
  revokeAutomationToken,
  touchAutomationToken,
} from '../src/lib/builders/automation-store';
import { hashAutomationToken, mintAutomationToken } from '../src/lib/builders/automation-secret';

/*
 * Against a real file, because the claims being made are about SQL. "A
 * revoked token stops working immediately" is a property of a `WHERE`
 * clause, and an in-memory stand-in for the database would prove something
 * about a stand-in.
 */
function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'pokter-automation-'));
  const db = new DatabaseSync(join(dir, 'builders.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  ensureAutomationTokens(db);
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

const OWNER = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const WEEK = new Date(Date.now() + 7 * 86_400_000).toISOString();

function mint(db: DatabaseSync, over: Partial<{ id: string; owner: string; scopes: string[]; expiresAt: string }> = {}) {
  const minted = mintAutomationToken();
  insertAutomationToken(db, {
    id: over.id ?? `id-${minted.hint}-${Math.random().toString(36).slice(2, 8)}`,
    tokenHash: minted.tokenHash,
    ownerAddress: over.owner ?? OWNER,
    label: 'Laptop',
    hint: minted.hint,
    scopes: over.scopes ?? ['requests:read', 'jobs:read'],
    createdAt: new Date().toISOString(),
    expiresAt: over.expiresAt ?? WEEK,
  });
  return minted;
}

test('ensureAutomationTokens is safe to run again on an existing database', () => {
  const { db, cleanup } = fresh();
  try {
    const minted = mint(db);
    ensureAutomationTokens(db);
    ensureAutomationTokens(db);
    assert.ok(liveAutomationToken(db, minted.tokenHash, new Date().toISOString()), 'the row must survive a re-run');
  } finally {
    cleanup();
  }
});

test('a live token authenticates, and only by its hash', () => {
  const { db, cleanup } = fresh();
  try {
    const minted = mint(db, { scopes: ['requests:read'] });
    const found = liveAutomationToken(db, minted.tokenHash, new Date().toISOString());
    assert.ok(found);
    assert.equal(found!.ownerAddress, OWNER.toLowerCase());
    assert.deepEqual(found!.scopes, ['requests:read']);
    // The secret itself is not a key into the table: only its digest is.
    assert.equal(liveAutomationToken(db, minted.token, new Date().toISOString()), null);
    assert.equal(liveAutomationToken(db, hashAutomationToken('pka_not-a-real-token'), new Date().toISOString()), null);
  } finally {
    cleanup();
  }
});

/*
 * The whole point of this credential, and the claim the setup page makes:
 * "revocation takes effect on the next call: there is nothing to wait out."
 *
 * INVERT THE GUARD TO CHECK THIS TEST: drop `AND revoked_at IS NULL` from
 * `liveAutomationToken`'s query and this test fails. A revocation that
 * takes effect at the next deploy is not a revocation.
 */
test('revoking a token stops the very next lookup', () => {
  const { db, cleanup } = fresh();
  try {
    const minted = mint(db, { id: 'to-revoke' });
    const now = () => new Date().toISOString();
    assert.ok(liveAutomationToken(db, minted.tokenHash, now()), 'live before revocation');
    assert.equal(revokeAutomationToken(db, OWNER, 'to-revoke', now()), true);
    assert.equal(liveAutomationToken(db, minted.tokenHash, now()), null, 'revocation must take effect at once');
    // Still listed, so the page can show what happened rather than losing the row.
    const listed = listAutomationTokens(db, OWNER);
    assert.equal(listed.length, 1);
    assert.ok(listed[0].revokedAt, 'a revoked token keeps its row and its revocation time');
  } finally {
    cleanup();
  }
});

test('revoking twice is reported as having changed nothing', () => {
  const { db, cleanup } = fresh();
  try {
    mint(db, { id: 'once' });
    assert.equal(revokeAutomationToken(db, OWNER, 'once', new Date().toISOString()), true);
    assert.equal(
      revokeAutomationToken(db, OWNER, 'once', new Date().toISOString()),
      false,
      'a second revocation must not claim to have done something',
    );
  } finally {
    cleanup();
  }
});

/*
 * A token id is printed on a page and is not a secret, so an id alone must
 * not be enough to revoke somebody else's automation.
 *
 * INVERT THE GUARD TO CHECK THIS TEST: drop `AND owner_address = ?` from
 * `revokeAutomationToken` and this fails.
 */
test('one wallet cannot revoke another wallet’s token', () => {
  const { db, cleanup } = fresh();
  try {
    const minted = mint(db, { id: 'mine', owner: OWNER });
    assert.equal(revokeAutomationToken(db, OTHER, 'mine', new Date().toISOString()), false);
    assert.ok(liveAutomationToken(db, minted.tokenHash, new Date().toISOString()), 'it must still be live');
    assert.deepEqual(listAutomationTokens(db, OTHER), [], 'and must not appear in the other wallet’s listing');
  } finally {
    cleanup();
  }
});

/*
 * INVERT THE GUARD TO CHECK THIS TEST: drop `AND expires_at > ?` from
 * `liveAutomationToken` and this fails. An expiry enforced only at mint
 * time is not an expiry.
 */
test('an expired token stops authenticating without anybody revoking it', () => {
  const { db, cleanup } = fresh();
  try {
    const past = new Date(Date.now() - 60_000).toISOString();
    const minted = mint(db, { expiresAt: past });
    assert.equal(liveAutomationToken(db, minted.tokenHash, new Date().toISOString()), null);
    // And it is read as expired against the clock it is given, not a cached one.
    assert.ok(liveAutomationToken(db, minted.tokenHash, new Date(Date.parse(past) - 1000).toISOString()));
  } finally {
    cleanup();
  }
});

test('a listing is one wallet’s, newest first, and never carries a secret', () => {
  const { db, cleanup } = fresh();
  try {
    const older = new Date(Date.now() - 10_000).toISOString();
    insertAutomationToken(db, {
      id: 'older', tokenHash: hashAutomationToken('pka_older-token-value-aaaaaaaaaaaaaaaa'), ownerAddress: OWNER,
      label: 'Older', hint: 'aaaa', scopes: ['jobs:read'], createdAt: older, expiresAt: WEEK,
    });
    mint(db, { id: 'newer' });
    mint(db, { id: 'theirs', owner: OTHER });
    const listed = listAutomationTokens(db, OWNER);
    assert.deepEqual(listed.map((t) => t.id), ['newer', 'older']);
    for (const row of listed) {
      assert.ok(!Object.keys(row).some((key) => /token_?hash|secret|token$/i.test(key)), `${row.id} exposes a secret field`);
    }
    // Case-insensitive: a checksummed and a lower-cased spelling are one wallet.
    assert.equal(listAutomationTokens(db, OWNER.toUpperCase().replace('0X', '0x')).length, 2);
  } finally {
    cleanup();
  }
});

test('the live count excludes revoked and expired, which is what caps a wallet', () => {
  const { db, cleanup } = fresh();
  try {
    const now = () => new Date().toISOString();
    mint(db, { id: 'a' });
    mint(db, { id: 'b' });
    mint(db, { id: 'c', expiresAt: new Date(Date.now() - 1000).toISOString() });
    revokeAutomationToken(db, OWNER, 'b', now());
    assert.equal(countLiveAutomationTokens(db, OWNER, now()), 1);
    assert.equal(listAutomationTokens(db, OWNER).length, 3, 'all three are still listed');
  } finally {
    cleanup();
  }
});

test('a call is recorded against the token that made it, and nothing else', () => {
  const { db, cleanup } = fresh();
  try {
    const mine = mint(db, { id: 'mine' });
    const theirs = mint(db, { id: 'theirs' });
    assert.equal(listAutomationTokens(db, OWNER).find((t) => t.id === 'mine')!.lastUsedAt, null);
    const at = '2026-06-01T12:00:00.000Z';
    touchAutomationToken(db, mine.tokenHash, at);
    const rows = listAutomationTokens(db, OWNER);
    assert.equal(rows.find((t) => t.id === 'mine')!.lastUsedAt, at);
    assert.equal(rows.find((t) => t.id === 'theirs')!.lastUsedAt, null);
    assert.ok(liveAutomationToken(db, theirs.tokenHash, new Date().toISOString()));
  } finally {
    cleanup();
  }
});

test('a row whose scopes cannot be parsed grants nothing rather than everything', () => {
  const { db, cleanup } = fresh();
  try {
    const minted = mintAutomationToken();
    insertAutomationToken(db, {
      id: 'broken', tokenHash: minted.tokenHash, ownerAddress: OWNER,
      label: 'Broken', hint: minted.hint, scopes: ['jobs:read'], createdAt: new Date().toISOString(), expiresAt: WEEK,
    });
    // However it got there — a bad migration, a hand edit — unreadable scopes must fail closed.
    db.prepare('UPDATE automation_tokens SET scopes = ? WHERE id = ?').run('{not json', 'broken');
    const found = liveAutomationToken(db, minted.tokenHash, new Date().toISOString());
    assert.ok(found, 'the row is still a row');
    assert.deepEqual(found!.scopes, [], 'and it carries no scope at all');
  } finally {
    cleanup();
  }
});
