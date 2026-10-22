import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ATTEMPT_RETENTION_DAYS,
  attemptDay,
  attemptFingerprint,
  type HireAttemptInput,
} from '../src/lib/builder/diagnostics/attempt';
import {
  applyHireAttemptSchema,
  attemptSaltIn,
  pruneHireAttemptsIn,
  readHireAttemptsIn,
  recordHireAttemptIn,
} from '../src/lib/builder/diagnostics/attempt-sql';

/*
 * Run against a real database on disk, not in memory and not against a
 * mock, because the whole correctness of this table is in one `ON CONFLICT`
 * clause and SQLite is the only thing that can say whether it does what it
 * reads like. The sibling case is on the record: a query written with
 * SQLite's `?1` passed typecheck, lint and the build, and took the homepage
 * down, because node:sqlite rejects that binding whatever is bound to it.
 */
function temporary(): { db: DatabaseSync; dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pokter-hire-attempts-'));
  const path = join(dir, 'hire-attempts.db');
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  applyHireAttemptSchema(db);
  return { db, dir, path };
}

const BRIEF = 'Rebalance my CAKE/BNB position to the 0.25% fee tier and report the range.';
const CLIENT = '203.0.113.8';

function attempt(over: Partial<HireAttemptInput> & { fingerprint: string }): HireAttemptInput {
  return {
    chainId: 56,
    tokenId: '45422',
    escrowChainId: null,
    source: 'buyer',
    outcome: 'stopped',
    code: 'timeout',
    layer: 'network',
    sellerReason: null,
    at: '2026-10-20T10:00:00.000Z',
    ...over,
  };
}

function print(input: { brief?: string; client?: string; day?: string; tokenId?: string; salt: string }) {
  return attemptFingerprint({
    salt: input.salt,
    clientKey: input.client ?? CLIENT,
    chainId: 56,
    tokenId: input.tokenId ?? '45422',
    brief: input.brief ?? BRIEF,
    day: input.day ?? '2026-10-20',
  });
}

test('a retry of the same ask is one attempt, counted once', () => {
  const { db, dir } = temporary();
  try {
    const salt = attemptSaltIn(db);
    const fingerprint = print({ salt });

    /*
     * The buyer presses the button three times because the agent timed out
     * twice, then gets a price. That is one person asking once. Counting
     * three would tell the builder they had three times the demand they
     * have — and tell them two hires failed when none did.
     */
    recordHireAttemptIn(db, attempt({ fingerprint, at: '2026-10-20T10:00:00.000Z' }));
    recordHireAttemptIn(db, attempt({ fingerprint, at: '2026-10-20T10:01:00.000Z' }));
    recordHireAttemptIn(db, attempt({ fingerprint, at: '2026-10-20T10:02:30.000Z', outcome: 'quoted', code: null, layer: null }));

    const rows = readHireAttemptsIn(db, { chainId: 56, tokenId: '45422', since: '2026-10-01T00:00:00.000Z' });
    assert.equal(rows.length, 1, 'three requests for one ask are one attempt');
    assert.equal(rows[0].tries, 3, 'the retries are still visible as requests');
    assert.equal(rows[0].outcome, 'quoted', 'the latest outcome wins: this ask did get a price');
    assert.equal(rows[0].code, null);
    assert.equal(rows[0].firstAt, '2026-10-20T10:00:00.000Z', 'the attempt keeps when it began');
    assert.equal(rows[0].lastAt, '2026-10-20T10:02:30.000Z');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('re-wrapping the brief is still the same ask', () => {
  const { db, dir } = temporary();
  try {
    const salt = attemptSaltIn(db);
    // A textarea that re-wraps, or a trailing newline from a paste, is not a
    // new thing to have been asked for.
    assert.equal(
      print({ salt, brief: BRIEF }),
      print({ salt, brief: `  ${BRIEF.replace(/ /g, '\n  ')}\n` }),
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a different brief, caller or day is a different attempt', () => {
  const { db, dir } = temporary();
  try {
    const salt = attemptSaltIn(db);
    const base = print({ salt });
    for (const [what, other] of [
      ['an edited brief is a different thing to have been asked for', print({ salt, brief: `${BRIEF} Use 0.05% instead.` })],
      ['another caller is another buyer', print({ salt, client: '198.51.100.4' })],
      ['tomorrow is new demand, not the same ask still running', print({ salt, day: '2026-10-21' })],
      ['another agent is another agent', print({ salt, tokenId: '45423' })],
    ] as const) {
      assert.notEqual(other, base, what);
    }

    recordHireAttemptIn(db, attempt({ fingerprint: base }));
    recordHireAttemptIn(db, attempt({ fingerprint: print({ salt, brief: `${BRIEF} Use 0.05% instead.` }) }));
    assert.equal(readHireAttemptsIn(db, { chainId: 56, tokenId: '45422', since: '2026-10-01T00:00:00.000Z' }).length, 2);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the salt survives a restart, so retries still collapse after a deploy', () => {
  const { db, dir, path } = temporary();
  try {
    const first = attemptSaltIn(db);
    assert.equal(attemptSaltIn(db), first, 'reading it twice must not mint a second');
    db.close();

    /*
     * A regenerated salt would make every stored attempt unmatchable: the
     * same buyer retrying after a restart would land on a fresh row and
     * read as a second attempt. Which is the bug the key exists to stop.
     */
    const reopened = new DatabaseSync(path);
    applyHireAttemptSchema(reopened);
    assert.equal(attemptSaltIn(reopened), first);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('neither the brief nor the caller reaches the file', () => {
  const { db, dir, path } = temporary();
  try {
    const salt = attemptSaltIn(db);
    recordHireAttemptIn(db, attempt({ fingerprint: print({ salt }) }));
    // Checkpointed so the WAL's contents are in the file being read.
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const bytes = readFileSync(path).toString('latin1');
    assert.ok(!bytes.includes('CAKE/BNB'), 'the brief must never be stored');
    assert.ok(!bytes.includes(CLIENT), 'the network address must never be stored');
    assert.ok(bytes.includes(print({ salt })), 'only the opaque key is stored');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the window is read on when an attempt was last tried', () => {
  const { db, dir } = temporary();
  try {
    const salt = attemptSaltIn(db);
    recordHireAttemptIn(db, attempt({ fingerprint: print({ salt, day: '2026-08-01' }), at: '2026-08-01T09:00:00.000Z' }));
    recordHireAttemptIn(db, attempt({ fingerprint: print({ salt }), at: '2026-10-20T09:00:00.000Z' }));

    const recent = readHireAttemptsIn(db, { chainId: 56, tokenId: '45422', since: '2026-10-01T00:00:00.000Z' });
    assert.equal(recent.length, 1);
    assert.equal(recent[0].lastAt, '2026-10-20T09:00:00.000Z');

    const all = readHireAttemptsIn(db, { chainId: 56, tokenId: '45422', since: '2026-01-01T00:00:00.000Z' });
    assert.deepEqual(all.map((row) => row.lastAt), ['2026-10-20T09:00:00.000Z', '2026-08-01T09:00:00.000Z'], 'newest first');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('one agent never reads another agent’s attempts', () => {
  const { db, dir } = temporary();
  try {
    const salt = attemptSaltIn(db);
    recordHireAttemptIn(db, attempt({ fingerprint: print({ salt }) }));
    recordHireAttemptIn(db, attempt({ fingerprint: print({ salt, tokenId: '45423' }), tokenId: '45423' }));
    // Same token id on the other chain: a different identity entirely.
    recordHireAttemptIn(db, attempt({ fingerprint: 'testnet-same-token-id', chainId: 97 }));

    const since = '2026-10-01T00:00:00.000Z';
    assert.deepEqual(readHireAttemptsIn(db, { chainId: 56, tokenId: '45422', since }).map((r) => r.tokenId), ['45422']);
    assert.deepEqual(readHireAttemptsIn(db, { chainId: 56, tokenId: '45423', since }).map((r) => r.tokenId), ['45423']);
    assert.equal(readHireAttemptsIn(db, { chainId: 97, tokenId: '45422', since }).length, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rows past the retention horizon are dropped', () => {
  const { db, dir } = temporary();
  try {
    const salt = attemptSaltIn(db);
    const now = Date.parse('2026-10-22T00:00:00.000Z');
    const old = new Date(now - (ATTEMPT_RETENTION_DAYS + 1) * 86_400_000).toISOString();
    recordHireAttemptIn(db, attempt({ fingerprint: print({ salt, day: attemptDay(new Date(old)) }), at: old }));
    recordHireAttemptIn(db, attempt({ fingerprint: print({ salt }), at: '2026-10-20T09:00:00.000Z' }));

    assert.equal(pruneHireAttemptsIn(db, new Date(now - ATTEMPT_RETENTION_DAYS * 86_400_000).toISOString()), 1);
    assert.equal(readHireAttemptsIn(db, { chainId: 56, tokenId: '45422', since: '2026-01-01T00:00:00.000Z' }).length, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an attempt on an empty table reads as an empty list, not a throw', () => {
  const { db, dir } = temporary();
  try {
    assert.deepEqual(readHireAttemptsIn(db, { chainId: 56, tokenId: '1', since: '2026-01-01T00:00:00.000Z' }), []);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
