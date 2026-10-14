import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Every seal Pokter has published, with the exact text that was hashed.
 *
 * The document text is kept verbatim rather than regenerated on request.
 * A seal regenerated from live data would re-read today's catalogue and
 * hash to something else the moment anything moved, which is the one
 * thing a seal must never do: a reader checking last week's hash would
 * be told Pokter's own record does not match its own anchor.
 */

export interface SealRow {
  hash: `0x${string}`;
  sealedAt: string;
  /** The canonical bytes. This is what the hash commits to. */
  text: string;
  claimCount: number;
  /** Null until the anchoring transaction confirms. */
  anchor: {
    chainId: number;
    transactionHash: `0x${string}`;
    blockNumber: number;
    /** Block time, which is what proves the seal predates an outcome. */
    blockTime: string;
  } | null;
}

export interface SealStore {
  record(row: Omit<SealRow, 'anchor'>): void;
  anchor(hash: string, anchor: NonNullable<SealRow['anchor']>): void;
  byHash(hash: string): SealRow | null;
  /** Newest first. */
  recent(limit: number): SealRow[];
  /** The most recent seal that reached the chain, for a diff against now. */
  latestAnchored(): SealRow | null;
}

interface Raw {
  hash: string;
  sealed_at: string;
  text: string;
  claim_count: number;
  anchor_chain_id: number | null;
  anchor_tx: string | null;
  anchor_block: number | null;
  anchor_block_time: string | null;
}

function toRow(raw: Raw): SealRow {
  return {
    hash: raw.hash as `0x${string}`,
    sealedAt: raw.sealed_at,
    text: raw.text,
    claimCount: raw.claim_count,
    anchor:
      raw.anchor_tx && raw.anchor_chain_id !== null && raw.anchor_block !== null && raw.anchor_block_time
        ? {
            chainId: raw.anchor_chain_id,
            transactionHash: raw.anchor_tx as `0x${string}`,
            blockNumber: raw.anchor_block,
            blockTime: raw.anchor_block_time,
          }
        : null,
  };
}

class SqliteSealStore implements SealStore {
  private db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS seals (
        hash TEXT PRIMARY KEY,
        sealed_at TEXT NOT NULL,
        text TEXT NOT NULL,
        claim_count INTEGER NOT NULL,
        anchor_chain_id INTEGER,
        anchor_tx TEXT,
        anchor_block INTEGER,
        anchor_block_time TEXT
      );
      CREATE INDEX IF NOT EXISTS seals_sealed_at ON seals (sealed_at DESC);
    `);
  }

  record(row: Omit<SealRow, 'anchor'>): void {
    /*
     * A seal is never rewritten. Re-running a seal that already exists is
     * a no-op rather than an update: the text behind a published hash is
     * the one thing a reader is entitled to find unchanged.
     */
    this.db
      .prepare(
        `INSERT INTO seals (hash, sealed_at, text, claim_count)
         VALUES (?, ?, ?, ?) ON CONFLICT(hash) DO NOTHING`,
      )
      .run(row.hash, row.sealedAt, row.text, row.claimCount);
  }

  anchor(hash: string, anchor: NonNullable<SealRow['anchor']>): void {
    this.db
      .prepare(
        `UPDATE seals SET anchor_chain_id = ?, anchor_tx = ?, anchor_block = ?, anchor_block_time = ?
         WHERE hash = ? AND anchor_tx IS NULL`,
      )
      .run(anchor.chainId, anchor.transactionHash, anchor.blockNumber, anchor.blockTime, hash);
  }

  byHash(hash: string): SealRow | null {
    const raw = this.db
      .prepare('SELECT * FROM seals WHERE hash = ?')
      .get(hash.toLowerCase()) as unknown as Raw | undefined;
    return raw ? toRow(raw) : null;
  }

  recent(limit: number): SealRow[] {
    return (
      this.db.prepare('SELECT * FROM seals ORDER BY sealed_at DESC LIMIT ?').all(limit) as unknown as Raw[]
    ).map(toRow);
  }

  latestAnchored(): SealRow | null {
    const raw = this.db
      .prepare('SELECT * FROM seals WHERE anchor_tx IS NOT NULL ORDER BY sealed_at DESC LIMIT 1')
      .get() as unknown as Raw | undefined;
    return raw ? toRow(raw) : null;
  }
}

const DB_PATH = process.env.SEAL_DB_PATH ?? './data/seals.db';

let cached: SealStore | null = null;

export function getSealStore(): SealStore {
  cached ??= new SqliteSealStore(DB_PATH);
  return cached;
}
