import type { DatabaseSync } from 'node:sqlite';

import type { Address } from 'viem';

/**
 * Proved publisher identities, as statements a test can run.
 *
 * `builders/store.ts` is `server-only` and opens its database at module
 * load, so nothing in `tests/` can import it. What has to be proven about
 * these rows is a property of the SQL — that a signature stops counting
 * once it is old enough — so these functions take the database and the test
 * runs the real statements against a real file. The pattern, and the
 * reason, are `automation-store.ts`'s.
 */

export interface VerifiedPublisherIdentity {
  owner: Address;
  chainId: number;
  tokenId: string;
  verifiedAt: string;
}

/**
 * How long a signature keeps answering for an identity.
 *
 * This table has one job: answer "which agents might this wallet act for"
 * when 8004scan cannot be read, so an assistant is not told "you own no
 * agents" during an indexer outage and does not conclude there is nothing
 * to do. It had no expiry at all, and a row was displaced only when the
 * *new* owner happened to verify — so a signature made once was a standing
 * claim on an identity for as long as the database lived. Handed to a
 * ninety-day headless credential, that is a former owner reading a new
 * owner's funded briefs and earnings.
 *
 * Thirty days, matching the default automation-token lifetime: long enough
 * that somebody who proved ownership when they set their automation up
 * still has the fallback through an outage a month later, short enough that
 * a year-old signature is not a permanent grant over an identity the wallet
 * may since have sold. Re-proving costs one signature at /build, and
 * nothing is authorised on this table's word in any case — every tool that
 * acts, and every tool that reads, confirms ownership against the ERC-8004
 * registry first. See `provider-ownership.ts`.
 */
export const VERIFIED_PUBLISHER_TTL_MS = 30 * 86_400_000;

export function ensureVerifiedPublishers(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS verified_publishers (
      owner_address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      token_id TEXT NOT NULL,
      signature TEXT NOT NULL,
      verified_at TEXT NOT NULL,
      PRIMARY KEY (chain_id, token_id)
    );
    CREATE INDEX IF NOT EXISTS idx_verified_publishers_owner
      ON verified_publishers (owner_address, verified_at DESC);
  `);
}

export function saveVerifiedPublisher(
  db: DatabaseSync,
  input: { owner: Address; chainId: number; tokenId: string; signature: string; verifiedAt?: string },
): VerifiedPublisherIdentity {
  const verifiedAt = input.verifiedAt ?? new Date().toISOString();
  db.prepare(`INSERT INTO verified_publishers
    (owner_address,chain_id,token_id,signature,verified_at) VALUES (?,?,?,?,?)
    ON CONFLICT(chain_id,token_id) DO UPDATE SET
      owner_address=excluded.owner_address, signature=excluded.signature, verified_at=excluded.verified_at`).run(
    input.owner.toLowerCase(), input.chainId, input.tokenId, input.signature, verifiedAt,
  );
  return { owner: input.owner, chainId: input.chainId, tokenId: input.tokenId, verifiedAt };
}

/**
 * The identities this wallet has proved lately.
 *
 * The expiry is in the `WHERE` clause rather than in JavaScript around it,
 * for the reason the automation token's is: there is then no window in
 * which a caller holds the row and has not yet decided whether to honour
 * it. The row itself is left in place — it is the record of a signature
 * that was made, and the primary key is what displaces a transferred
 * identity when its new owner verifies — it simply stops answering.
 */
export function verifiedPublisherByOwner(
  db: DatabaseSync,
  owner: Address,
  now: number = Date.now(),
): VerifiedPublisherIdentity[] {
  const rows = db.prepare(`SELECT owner_address,chain_id,token_id,verified_at
    FROM verified_publishers WHERE owner_address=? AND verified_at>? ORDER BY verified_at DESC`).all(
    owner.toLowerCase(), new Date(now - VERIFIED_PUBLISHER_TTL_MS).toISOString(),
  ) as unknown as Array<Record<string, string | number>>;
  return rows.map((row) => ({
    owner, chainId: Number(row.chain_id), tokenId: String(row.token_id), verifiedAt: String(row.verified_at),
  }));
}
