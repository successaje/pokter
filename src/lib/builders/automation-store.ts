import type { DatabaseSync } from 'node:sqlite';

/**
 * Where automation tokens live, as statements a test can run.
 *
 * `builders/store.ts` is `server-only` and opens its database at module
 * load, so nothing in `tests/` can import it. What has to be proven about
 * these tokens is a property of the SQL and not of the types around it —
 * that a revoked token stops authenticating on the very next call, that an
 * expired one does too, and that one builder cannot revoke another's — so
 * these functions take the database and the test runs the real statements
 * against a real file.
 *
 * The lifetime checks are deliberately in the `WHERE` clause of the lookup
 * rather than in JavaScript around it. There is then no window in which a
 * caller has the row and has not yet decided whether to honour it, and no
 * cached decision to invalidate: revocation is a column on the row the next
 * call reads.
 */

export interface AutomationTokenRecord {
  id: string;
  ownerAddress: string;
  label: string;
  hint: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface AutomationTokenWrite {
  id: string;
  tokenHash: string;
  ownerAddress: string;
  label: string;
  hint: string;
  scopes: readonly string[];
  createdAt: string;
  expiresAt: string;
}

export function ensureAutomationTokens(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS automation_tokens (
      id            TEXT PRIMARY KEY,
      token_hash    TEXT NOT NULL UNIQUE,
      owner_address TEXT NOT NULL,
      label         TEXT NOT NULL,
      hint          TEXT NOT NULL,
      scopes        TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      expires_at    TEXT NOT NULL,
      revoked_at    TEXT,
      last_used_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_automation_tokens_owner
      ON automation_tokens (owner_address, created_at DESC);
  `);
}

function toRecord(row: Record<string, unknown>): AutomationTokenRecord {
  const scopes = (() => {
    try {
      const parsed = JSON.parse(String(row.scopes));
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      /* A row whose scopes cannot be read grants nothing, rather than everything. */
      return [];
    }
  })();
  return {
    id: String(row.id),
    ownerAddress: String(row.owner_address),
    label: String(row.label),
    hint: String(row.hint),
    scopes,
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    revokedAt: (row.revoked_at as string | null) ?? null,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
  };
}

export function insertAutomationToken(db: DatabaseSync, write: AutomationTokenWrite): void {
  db.prepare(
    `INSERT INTO automation_tokens
       (id, token_hash, owner_address, label, hint, scopes, created_at, expires_at, revoked_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
  ).run(
    write.id,
    write.tokenHash,
    write.ownerAddress.toLowerCase(),
    write.label,
    write.hint,
    JSON.stringify([...write.scopes]),
    write.createdAt,
    write.expiresAt,
  );
}

/**
 * The live token for this hash, or null.
 *
 * Revoked and expired are both excluded here, in SQL. Inverting either
 * condition is what `tests/automation-token-store.test.mts` mutates, and
 * both mutations have to fail: a revocation that only takes effect at the
 * next restart is not a revocation, and an expiry enforced at mint time is
 * not an expiry.
 */
export function liveAutomationToken(db: DatabaseSync, tokenHash: string, nowIso: string): AutomationTokenRecord | null {
  const row = db
    .prepare('SELECT * FROM automation_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?')
    .get(tokenHash, nowIso) as Record<string, unknown> | undefined;
  return row ? toRecord(row) : null;
}

/** Every token this wallet has minted, newest first, live or not. */
export function listAutomationTokens(db: DatabaseSync, ownerAddress: string): AutomationTokenRecord[] {
  const rows = db
    .prepare('SELECT * FROM automation_tokens WHERE owner_address = ? ORDER BY created_at DESC')
    .all(ownerAddress.toLowerCase()) as unknown as Array<Record<string, unknown>>;
  return rows.map(toRecord);
}

export function countLiveAutomationTokens(db: DatabaseSync, ownerAddress: string, nowIso: string): number {
  const row = db
    .prepare(
      'SELECT COUNT(*) AS n FROM automation_tokens WHERE owner_address = ? AND revoked_at IS NULL AND expires_at > ?',
    )
    .get(ownerAddress.toLowerCase(), nowIso) as { n: number };
  return Number(row.n);
}

/**
 * Revoke one token, if it is this wallet's.
 *
 * The owner is in the `WHERE` clause and not checked beforehand: a token id
 * is listed in a page and is not a secret, so an id alone must not be
 * enough to revoke somebody else's automation. Already-revoked returns
 * false, so the page can say "already revoked" rather than claim it has
 * just done something.
 */
export function revokeAutomationToken(db: DatabaseSync, ownerAddress: string, id: string, nowIso: string): boolean {
  return (
    Number(
      db
        .prepare('UPDATE automation_tokens SET revoked_at = ? WHERE id = ? AND owner_address = ? AND revoked_at IS NULL')
        .run(nowIso, id, ownerAddress.toLowerCase()).changes,
    ) === 1
  );
}

/**
 * Note that a token was just used.
 *
 * The only signal Pokter has about whether somebody's assistant is running:
 * it runs on their machine, so this records a call that arrived and never
 * claims the assistant is up. Written on every authenticated call, which is
 * cheap — one indexed update — and is what makes the page's "last call"
 * honest rather than a status someone set.
 */
export function touchAutomationToken(db: DatabaseSync, tokenHash: string, nowIso: string): void {
  db.prepare('UPDATE automation_tokens SET last_used_at = ? WHERE token_hash = ?').run(nowIso, tokenHash);
}
