import 'server-only';

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { ensureX402 } from './receipts';

const DB_PATH = process.env.X402_DB_PATH ?? './data/x402.db';
let database: DatabaseSync | null = null;

export function x402Db(): DatabaseSync {
  if (database) return database;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec('PRAGMA journal_mode = WAL');
  ensureX402(database);
  return database;
}
