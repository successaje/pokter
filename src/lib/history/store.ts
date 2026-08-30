import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** One recorded probe of one agent at one moment. */
export interface ProbeRecord {
  chainId: number;
  tokenId: string;
  endpoint: string | null;
  protocol: string;
  ok: boolean;
  latencyMs: number | null;
  status: number | null;
  detail: string;
  probedAt: string;
}

/** Summary of one sweep across the roster. */
export interface SweepRecord {
  startedAt: string;
  finishedAt: string;
  agents: number;
  probes: number;
  answered: number;
}

/**
 * Persistence for accumulated measurements.
 *
 * Kept behind an interface deliberately: the SQLite implementation writes to
 * local disk, which is correct for a long-running host but wrong for an
 * ephemeral serverless filesystem. Swapping in a hosted database at deploy time
 * should not require touching anything above this boundary.
 */
export interface ProbeStore {
  record(probes: ProbeRecord[]): void;
  recordSweep(sweep: SweepRecord): void;
  /** Probes for one agent, newest first, limited to `since`. */
  historyFor(chainId: number, tokenId: string, since: Date): ProbeRecord[];
  /** Agents we hold any history for, as `chainId:tokenId`. */
  trackedAgents(): { chainId: number; tokenId: string }[];
  lastSweep(): SweepRecord | null;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS probes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id   INTEGER NOT NULL,
    token_id   TEXT    NOT NULL,
    endpoint   TEXT,
    protocol   TEXT    NOT NULL,
    ok         INTEGER NOT NULL,
    latency_ms INTEGER,
    status     INTEGER,
    detail     TEXT    NOT NULL,
    probed_at  TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_probes_agent
    ON probes (chain_id, token_id, probed_at DESC);

  CREATE TABLE IF NOT EXISTS sweeps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT    NOT NULL,
    finished_at TEXT    NOT NULL,
    agents      INTEGER NOT NULL,
    probes      INTEGER NOT NULL,
    answered    INTEGER NOT NULL
  );
`;

interface ProbeRow {
  chain_id: number;
  token_id: string;
  endpoint: string | null;
  protocol: string;
  ok: number;
  latency_ms: number | null;
  status: number | null;
  detail: string;
  probed_at: string;
}

interface SweepRow {
  started_at: string;
  finished_at: string;
  agents: number;
  probes: number;
  answered: number;
}

function rowToProbe(row: ProbeRow): ProbeRecord {
  return {
    chainId: row.chain_id,
    tokenId: row.token_id,
    endpoint: row.endpoint,
    protocol: row.protocol,
    ok: row.ok === 1,
    latencyMs: row.latency_ms,
    status: row.status,
    detail: row.detail,
    probedAt: row.probed_at,
  };
}

class SqliteProbeStore implements ProbeStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    // WAL keeps a running sweep from blocking page reads.
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  record(probes: ProbeRecord[]): void {
    if (probes.length === 0) return;

    const insert = this.db.prepare(
      `INSERT INTO probes
         (chain_id, token_id, endpoint, protocol, ok, latency_ms, status, detail, probed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    this.db.exec('BEGIN');
    try {
      for (const p of probes) {
        insert.run(
          p.chainId,
          p.tokenId,
          p.endpoint,
          p.protocol,
          p.ok ? 1 : 0,
          p.latencyMs,
          p.status,
          p.detail,
          p.probedAt,
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  recordSweep(sweep: SweepRecord): void {
    this.db
      .prepare(
        `INSERT INTO sweeps (started_at, finished_at, agents, probes, answered)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        sweep.startedAt,
        sweep.finishedAt,
        sweep.agents,
        sweep.probes,
        sweep.answered,
      );
  }

  historyFor(chainId: number, tokenId: string, since: Date): ProbeRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM probes
          WHERE chain_id = ? AND token_id = ? AND probed_at >= ?
          ORDER BY probed_at DESC`,
      )
      .all(chainId, tokenId, since.toISOString()) as unknown as ProbeRow[];

    return rows.map(rowToProbe);
  }

  trackedAgents(): { chainId: number; tokenId: string }[] {
    const rows = this.db
      .prepare('SELECT DISTINCT chain_id, token_id FROM probes')
      .all() as unknown as { chain_id: number; token_id: string }[];

    return rows.map((r) => ({ chainId: r.chain_id, tokenId: r.token_id }));
  }

  lastSweep(): SweepRecord | null {
    const row = this.db
      .prepare('SELECT * FROM sweeps ORDER BY id DESC LIMIT 1')
      .get() as unknown as SweepRow | undefined;

    if (!row) return null;
    return {
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      agents: row.agents,
      probes: row.probes,
      answered: row.answered,
    };
  }
}

let cached: ProbeStore | null = null;

/**
 * The process-wide store. Cached because opening SQLite per request would
 * churn file handles under Next's request-per-render model.
 */
export function getProbeStore(): ProbeStore {
  if (cached) return cached;

  const path = resolve(
    process.env.PROBE_DB_PATH ?? './data/probes.db',
  );
  cached = new SqliteProbeStore(path);
  return cached;
}
