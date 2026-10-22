import type { DatabaseSync } from 'node:sqlite';

import { ownersSignedAtMs } from './owners';

/**
 * The row a watched trading wallet keeps, and the guarded write that puts
 * its owner list there.
 *
 * Separated from `./store` for the reason `../history/stats-query` is: the
 * store is `server-only` and cannot be imported from a test, and the fault
 * this file exists to prevent is a race that only running the real SQL, out
 * of order, can catch.
 *
 * The defect it closes: `/api/trading/owners` read `owners_signed_at`,
 * checked the request against that snapshot, verified the signature across
 * two `await`s, and then wrote with `UPDATE trading_wallets SET owners = ?,
 * owners_signed_at = ? WHERE wallet = ?` — no guard at all. Two requests
 * that overlapped in those awaits both passed the check against the same
 * snapshot, and whichever wrote last won. So the owner could remove an
 * address, a slower earlier request could land after the removal, and the
 * address would be back. Those addresses are the one exception to the
 * alert, so a list that quietly reverts is a drain that quietly stops
 * raising one.
 *
 * The fix is the shape `noteJobAttempt` in `../history/maintenance-store`
 * uses: decide against what is recorded at the moment of writing, and drop
 * a write that is not newer. Here the comparison sits inside the `UPDATE`'s
 * own `WHERE`, so deciding and writing are one statement — the same check
 * written in JavaScript around the statement would leave the gap it is
 * meant to close, because a concurrent writer could still land between the
 * read and the write.
 */

/** Why a signed owner list did not land, or `applied` when it did. */
export type OwnerListWrite = 'applied' | 'not-newer' | 'not-watched';

export interface OwnerList {
  owners: string[];
  /** The time the wallet signed the list, as it signed it. */
  signedAt: string | null;
}

/**
 * Create the watched-wallet table and bring an older one up to date.
 *
 * `owners_signed_ms` is the ordering key, and it is a number because
 * `issuedAt` arrives from a client: `Date.parse` accepts an offset, so
 * `2026-10-21T13:00:00+01:00` is half an hour earlier than
 * `2026-10-21T12:30:00Z` while sorting after it as text. Comparing the
 * stored text would have ordered those two the wrong way round and let the
 * older list win. `owners_signed_at` is kept beside it, unchanged, because
 * that is the string the wallet actually signed.
 *
 * The key is reconciled with the text on every open rather than only
 * backfilled where it is null. A row whose list was last written by a build
 * without this column keeps whatever key it held before, and would then be
 * ordered by a time earlier than the list it actually holds — so a signature
 * older than that list could win. That is the defect this file exists to
 * close, arriving by way of a rollback instead of a race. The pilot caps the
 * watch at fifty wallets, so reconciling costs nothing worth saving.
 */
export function ensureWatchedWallets(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trading_wallets (
      wallet       TEXT PRIMARY KEY,
      agent_key    TEXT,
      owners       TEXT NOT NULL DEFAULT '[]',
      added_at     TEXT NOT NULL,
      scanned_to   INTEGER,
      last_scan_at TEXT,
      last_error   TEXT
    );
  `);
  const columns = (db.prepare('PRAGMA table_info(trading_wallets)').all() as Array<{ name: string }>).map((c) => c.name);
  /* Added with signed owner lists; a wallet watched before has none signed. */
  if (!columns.includes('owners_signed_at')) db.exec('ALTER TABLE trading_wallets ADD COLUMN owners_signed_at TEXT');
  if (!columns.includes('owners_signed_ms')) db.exec('ALTER TABLE trading_wallets ADD COLUMN owners_signed_ms INTEGER');

  const signed = db
    .prepare('SELECT wallet, owners_signed_at, owners_signed_ms FROM trading_wallets WHERE owners_signed_at IS NOT NULL')
    .all() as Array<{ wallet: string; owners_signed_at: string; owners_signed_ms: number | bigint | null }>;
  const setMs = db.prepare('UPDATE trading_wallets SET owners_signed_ms = ? WHERE wallet = ?');
  for (const row of signed) {
    const ms = ownersSignedAtMs(row.owners_signed_at);
    const recorded = row.owners_signed_ms === null ? null : Number(row.owners_signed_ms);
    if (ms !== null && ms !== recorded) setMs.run(ms, row.wallet);
  }
}

/**
 * Start watching a wallet. Never touches the owner list: that is the
 * exception to the alert, and only `recordSignedOwners`, after a signature
 * from the wallet, may change it.
 */
export function watchWallet(db: DatabaseSync, input: { wallet: string; agentKey: string | null; addedAt: string }): void {
  db.prepare(
    `INSERT INTO trading_wallets (wallet, agent_key, owners, added_at) VALUES (?, ?, '[]', ?)
       ON CONFLICT (wallet) DO UPDATE SET agent_key = COALESCE(excluded.agent_key, trading_wallets.agent_key)`,
  ).run(input.wallet.toLowerCase(), input.agentKey, input.addedAt);
}

export function readOwnerList(db: DatabaseSync, wallet: string): OwnerList | null {
  const row = db.prepare('SELECT owners, owners_signed_at FROM trading_wallets WHERE wallet = ?').get(wallet.toLowerCase()) as
    | { owners: string; owners_signed_at: string | null }
    | undefined;
  return row ? { owners: JSON.parse(row.owners) as string[], signedAt: row.owners_signed_at ?? null } : null;
}

/**
 * Replace the owner list with one the wallet signed at `signedAt`, unless
 * what is recorded was signed at the same time or later.
 *
 * The caller must have verified the signature first (`ownersSignatureProblem`
 * then `signedByWallet`): this decides which of two authorised lists is the
 * newer, never whether either was authorised.
 *
 * One statement, so the decision and the write cannot be separated. Equal
 * times do not win either, which makes a request that arrives twice a no-op
 * rather than a second write saying the same thing.
 */
export function recordSignedOwners(
  db: DatabaseSync,
  input: { wallet: string; owners: readonly string[]; signedAt: string },
): OwnerListWrite {
  const wallet = input.wallet.toLowerCase();
  const signedMs = ownersSignedAtMs(input.signedAt);
  /* `ownersSignatureProblem` already refuses a time that cannot be read.
     Refusing it again keeps a null out of the ordering key, which would
     otherwise let the next signature win however old it was. */
  if (signedMs === null) return watchedWallet(db, wallet) ? 'not-newer' : 'not-watched';

  const changed = Number(
    db
      .prepare(
        `UPDATE trading_wallets
            SET owners = :owners, owners_signed_at = :signedAt, owners_signed_ms = :signedMs
          WHERE wallet = :wallet
            AND (owners_signed_ms IS NULL OR owners_signed_ms < :signedMs)`,
      )
      .run({
        owners: JSON.stringify(input.owners.map((o) => o.toLowerCase())),
        signedAt: input.signedAt,
        signedMs,
        wallet,
      }).changes,
  );
  if (changed > 0) return 'applied';

  /* Nothing changed for one of two reasons and the caller says different
     things about them. Reading the row now only chooses the words: the
     statement above already decided, so whatever happens between the two
     cannot cost an update. */
  return watchedWallet(db, wallet) ? 'not-newer' : 'not-watched';
}

function watchedWallet(db: DatabaseSync, wallet: string): boolean {
  return db.prepare('SELECT 1 FROM trading_wallets WHERE wallet = ?').get(wallet) !== undefined;
}
