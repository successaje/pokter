import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface StoredDeliverable {
  jobId: string;
  manifestText: string;
  submitTxHash: `0x${string}` | null;
  createdAt: string;
}

export interface DeliveryChallenge {
  id: string;
  jobId: string;
  provider: `0x${string}`;
  message: string;
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
    );
    CREATE TABLE IF NOT EXISTS delivery_challenges (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      message TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_delivery_challenges_job
      ON delivery_challenges (job_id, expires_at DESC);
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

export function createDeliveryChallenge(jobId: string, provider: `0x${string}`): DeliveryChallenge {
  const id = randomUUID();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 5 * 60_000);
  const nonce = randomBytes(24).toString('base64url');
  const message = [
    'Pokter provider authorization',
    '',
    `Job: ${jobId}`,
    `Provider: ${provider}`,
    `Challenge: ${id}`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt.toISOString()}`,
    `Expires: ${expiresAt.toISOString()}`,
    '',
    'This signature authorizes preparation of this job deliverable. It does not submit a transaction or move funds.',
  ].join('\n');
  db().prepare(`INSERT INTO delivery_challenges
    (id,job_id,provider,message,expires_at) VALUES (?,?,?,?,?)`).run(
    id, jobId, provider.toLowerCase(), message, expiresAt.toISOString(),
  );
  return { id, jobId, provider, message };
}

export function readDeliveryChallenge(id: string): DeliveryChallenge | null {
  const row = db().prepare(`SELECT id,job_id,provider,message FROM delivery_challenges
    WHERE id=? AND consumed_at IS NULL AND expires_at>?`).get(
    id, new Date().toISOString(),
  ) as { id: string; job_id: string; provider: `0x${string}`; message: string } | undefined;
  return row ? { id: row.id, jobId: row.job_id, provider: row.provider, message: row.message } : null;
}

export function consumeDeliveryChallenge(id: string): boolean {
  return db().prepare(`UPDATE delivery_challenges SET consumed_at=?
    WHERE id=? AND consumed_at IS NULL AND expires_at>?`).run(
    new Date().toISOString(), id, new Date().toISOString(),
  ).changes === 1;
}
