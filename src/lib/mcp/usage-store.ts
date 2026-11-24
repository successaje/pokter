import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

import type { McpCall, McpSurface } from './usage';

/**
 * How often each MCP tool is called, by day and surface.
 *
 * The same shape and the same restraint as the conversion funnel next
 * door: a daily aggregate, no caller id, no arguments, no exact time. It
 * answers whether the registry listing brought anyone, which tools they
 * reached for and whether those calls worked — and it cannot answer
 * anything about a particular person, because none of that is kept.
 *
 * Its own file rather than a column on the conversion store, because that
 * one is keyed per agent and most of these calls name no agent: a search
 * is a call with no subject, and forcing one in would mean inventing it.
 */
const DB_PATH = process.env.MCP_USAGE_DB_PATH ?? './data/mcp-usage.db';
let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (database) return database;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec('PRAGMA journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS daily_mcp_call (
      day     TEXT    NOT NULL,
      surface TEXT    NOT NULL,
      tool    TEXT    NOT NULL,
      ok      INTEGER NOT NULL,
      count   INTEGER NOT NULL,
      PRIMARY KEY (day, surface, tool, ok)
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_call_day ON daily_mcp_call (day);
  `);
  return database;
}

const dayOf = (at: Date) => at.toISOString().slice(0, 10);

/**
 * Write down that these calls happened.
 *
 * Never throws: this is a counter beside the answer, and a locked or
 * unwritable file must not turn a working tool call into an error for the
 * assistant that made it. A lost count is a lost count.
 */
export function recordMcpCalls(surface: McpSurface, calls: readonly McpCall[], now = new Date()): void {
  if (calls.length === 0) return;
  try {
    const insert = db().prepare(
      `INSERT INTO daily_mcp_call (day, surface, tool, ok, count) VALUES (:day, :surface, :tool, :ok, 1)
         ON CONFLICT (day, surface, tool, ok) DO UPDATE SET count = count + 1`,
    );
    const day = dayOf(now);
    for (const call of calls) insert.run({ day, surface, tool: call.tool, ok: call.ok ? 1 : 0 });
  } catch {
    /* Counting is not the product. */
  }
}

/** One tool's traffic over the window asked for. */
export interface McpToolUsage {
  surface: McpSurface;
  tool: string;
  answered: number;
  failed: number;
}

/**
 * What the MCP servers were asked for over the last `days`, busiest first.
 *
 * Empty is a real answer and the one worth being able to read plainly:
 * nobody called. It is why this exists.
 */
export function mcpUsage(days = 30, now = new Date()): McpToolUsage[] {
  const since = dayOf(new Date(now.getTime() - days * 86_400_000));
  const rows = db()
    .prepare(
      `SELECT surface, tool,
              COALESCE(SUM(CASE WHEN ok = 1 THEN count END), 0) AS answered,
              COALESCE(SUM(CASE WHEN ok = 0 THEN count END), 0) AS failed
         FROM daily_mcp_call
        WHERE day >= :since
        GROUP BY surface, tool
        ORDER BY (answered + failed) DESC, tool`,
    )
    .all({ since }) as unknown as { surface: string; tool: string; answered: number; failed: number }[];

  return rows.map((row) => ({
    surface: row.surface as McpSurface,
    tool: String(row.tool),
    answered: Number(row.answered),
    failed: Number(row.failed),
  }));
}
