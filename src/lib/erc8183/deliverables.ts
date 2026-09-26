import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface StoredDeliverable {
  jobId: string;
  manifestText: string;
  submitTxHash: `0x${string}` | null;
  createdAt: string;
}

const DB_PATH = process.env.DELIVERABLE_DB_PATH ?? './data/deliverables.db';

let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (database) return database;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec('PRAGMA journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS deliverables (
      job_id TEXT PRIMARY KEY,
      manifest_text TEXT NOT NULL,
      submit_tx_hash TEXT,
      created_at TEXT NOT NULL
    )
  `);
  return database;
}

export function readDeliverable(jobId: string): StoredDeliverable | null {
  const row = db()
    .prepare('SELECT * FROM deliverables WHERE job_id = ?')
    .get(jobId) as
    | {
        job_id: string;
        manifest_text: string;
        submit_tx_hash: string | null;
        created_at: string;
      }
    | undefined;
  return row
    ? {
        jobId: row.job_id,
        manifestText: row.manifest_text,
        submitTxHash: row.submit_tx_hash as `0x${string}` | null,
        createdAt: row.created_at,
      }
    : null;
}

export function writeDeliverable(value: StoredDeliverable): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO deliverables
        (job_id, manifest_text, submit_tx_hash, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(value.jobId, value.manifestText, value.submitTxHash, value.createdAt);
}
