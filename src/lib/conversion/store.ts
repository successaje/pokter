import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

import { conversionField, emptyConversionCounts, type ConversionCounts, type ConversionEvent } from './funnel';

const DB_PATH = process.env.CONVERSION_DB_PATH ?? './data/conversion.db';
let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (database) return database;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec('PRAGMA journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS daily_agent_conversion (
      day TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      token_id TEXT NOT NULL,
      escrow_chain_id INTEGER NOT NULL,
      event TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (day, chain_id, token_id, escrow_chain_id, event)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_conversion_agent
      ON daily_agent_conversion (chain_id, token_id, day);
  `);
  return database;
}

/**
 * Increment a daily aggregate. No visitor id, wallet, IP, task text or exact
 * timestamp is retained, so this can measure product friction without
 * building a buyer-tracking dataset.
 */
export function recordConversion(input: {
  event: ConversionEvent;
  chainId: number;
  tokenId: string;
  escrowChainId: number | null;
  now?: Date;
}): void {
  const now = input.now ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const handle = db();
  handle.prepare(`
    INSERT INTO daily_agent_conversion (day, chain_id, token_id, escrow_chain_id, event, count)
    VALUES (?, ?, ?, ?, ?, 1)
    ON CONFLICT(day, chain_id, token_id, escrow_chain_id, event)
    DO UPDATE SET count = count + 1
  `).run(day, input.chainId, input.tokenId, input.escrowChainId ?? 0, input.event);
  const retentionStart = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  handle.prepare('DELETE FROM daily_agent_conversion WHERE day < ?').run(retentionStart);
}

export function agentConversion(chainId: number, tokenId: string, days = 30, now = new Date()): ConversionCounts {
  const since = new Date(now.getTime() - Math.max(1, days - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = db().prepare(`
    SELECT event, SUM(count) AS count, MIN(day) AS first_day
    FROM daily_agent_conversion
    WHERE chain_id = ? AND token_id = ? AND day >= ?
    GROUP BY event
  `).all(chainId, tokenId, since) as Array<{ event: ConversionEvent; count: number; first_day: string }>;
  const result = emptyConversionCounts();
  for (const row of rows) {
    result[conversionField(row.event)] = Number(row.count);
    if (!result.firstObservedDay || row.first_day < result.firstObservedDay) result.firstObservedDay = row.first_day;
  }
  return result;
}
