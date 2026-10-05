import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { readProbeTotals } from '@/lib/history/stats-query';

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

/**
 * The last price one agent quoted for itself.
 *
 * Only ever one row per agent: a quote carries an expiry measured in minutes,
 * so a history of stale prices would be a history of numbers nobody may still
 * honour. The current observation, dated, is the honest thing to keep.
 */
export interface QuoteRecord {
  chainId: number;
  tokenId: string;
  priceRaw: string;
  priceU: number;
  currency: string;
  signer: string;
  quotedAt: string;
  expiresAt: string | null;
  /** The chain and contract the seller bound its signature to, if it said. */
  domain: { chainId: number; verifyingContract: string } | null;
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
  /** Replace each agent's stored quote with what it just said. */
  recordQuotes(quotes: QuoteRecord[]): void;
  /** The last quote held for each of the given agents, keyed `chainId:tokenId`. */
  quotesFor(agents: { chainId: number; tokenId: string }[]): Map<string, QuoteRecord>;
  /** Probes for one agent, newest first, limited to `since`. */
  historyFor(chainId: number, tokenId: string, since: Date): ProbeRecord[];
  /** Agents we hold any history for, as `chainId:tokenId`. */
  trackedAgents(): { chainId: number; tokenId: string }[];
  /**
   * Add an agent to the sweep roster without recording anything about it.
   *
   * Deliberately separate from `record`. Enrolment says "call this from now
   * on"; a probe says "this is what happened when we did". Keeping them apart
   * is what stops a builder who runs the diagnostic repeatedly from writing
   * their own track record — every figure Pokter publishes still comes from a
   * sweep Pokter scheduled, which is the one claim this marketplace cannot
   * afford to have bought.
   */
  enroll(agents: { chainId: number; tokenId: string }[]): void;
  /** Agents asked to be measured, whether or not they have been yet. */
  enrolledAgents(): { chainId: number; tokenId: string }[];
  lastSweep(): SweepRecord | null;
  /** Aggregate counts for the ecosystem panel. */
  /**
   * Measurement totals, optionally for one chain.
   *
   * The filter exists because Pokter probes more than it lists. Testnet
   * agents are measured so a track record accrues before anything is
   * listed from there, and folding those into the census would quietly
   * restate what "agents monitored" means on a page whose argument is the
   * size of the gap between registered and answering.
   */
  stats(chainId?: number): StoreStats;
  /** The most recent probes taken, newest first, across all agents. */
  recent(limit: number): ProbeRecord[];
}

/** What Pokter itself has measured, as opposed to what the registry reports. */
export interface StoreStats {
  agentsMonitored: number;
  /**
   * Agents that have ever answered Pokter when called.
   *
   * Counted separately from `agentsMonitored` because the difference between
   * them is the one number this marketplace exists to report: a registry
   * entry is a claim that something is there, and most of them are not.
   */
  agentsAnswering: number;
  probesTaken: number;
  probesAnswered: number;
  sweeps: number;
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

  CREATE TABLE IF NOT EXISTS quotes (
    chain_id   INTEGER NOT NULL,
    token_id   TEXT    NOT NULL,
    price_raw  TEXT    NOT NULL,
    price_u    REAL    NOT NULL,
    currency   TEXT    NOT NULL,
    signer     TEXT    NOT NULL,
    quoted_at  TEXT    NOT NULL,
    expires_at TEXT,
    domain_chain_id INTEGER,
    domain_contract TEXT,
    PRIMARY KEY (chain_id, token_id)
  );

  CREATE TABLE IF NOT EXISTS enrolled (
    chain_id    INTEGER NOT NULL,
    token_id    TEXT    NOT NULL,
    enrolled_at TEXT    NOT NULL,
    PRIMARY KEY (chain_id, token_id)
  );

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

interface QuoteRow {
  chain_id: number;
  token_id: string;
  price_raw: string;
  price_u: number;
  currency: string;
  signer: string;
  quoted_at: string;
  expires_at: string | null;
  domain_chain_id: number | null;
  domain_contract: string | null;
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
    // CREATE TABLE IF NOT EXISTS does not add columns to a table that is
    // already there, and the deployed index has quotes in it worth keeping.
    for (const statement of [
      'ALTER TABLE quotes ADD COLUMN domain_chain_id INTEGER',
      'ALTER TABLE quotes ADD COLUMN domain_contract TEXT',
    ]) {
      try {
        this.db.exec(statement);
      } catch (error) {
        if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) {
          throw error;
        }
      }
    }
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

  recordQuotes(quotes: QuoteRecord[]): void {
    if (quotes.length === 0) return;

    const upsert = this.db.prepare(
      `INSERT INTO quotes
         (chain_id, token_id, price_raw, price_u, currency, signer, quoted_at, expires_at,
          domain_chain_id, domain_contract)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (chain_id, token_id) DO UPDATE SET
         price_raw = excluded.price_raw,
         price_u = excluded.price_u,
         currency = excluded.currency,
         signer = excluded.signer,
         quoted_at = excluded.quoted_at,
         expires_at = excluded.expires_at,
         domain_chain_id = excluded.domain_chain_id,
         domain_contract = excluded.domain_contract`,
    );

    this.db.exec('BEGIN');
    try {
      for (const q of quotes) {
        upsert.run(
          q.chainId,
          q.tokenId,
          q.priceRaw,
          q.priceU,
          q.currency,
          q.signer,
          q.quotedAt,
          q.expiresAt,
          q.domain?.chainId ?? null,
          q.domain?.verifyingContract ?? null,
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  quotesFor(
    agents: { chainId: number; tokenId: string }[],
  ): Map<string, QuoteRecord> {
    const found = new Map<string, QuoteRecord>();
    if (agents.length === 0) return found;

    const select = this.db.prepare(
      'SELECT * FROM quotes WHERE chain_id = ? AND token_id = ?',
    );
    for (const agent of agents) {
      const row = select.get(agent.chainId, agent.tokenId) as
        | unknown as QuoteRow
        | undefined;
      if (!row) continue;
      found.set(`${row.chain_id}:${row.token_id}`, {
        chainId: row.chain_id,
        tokenId: row.token_id,
        priceRaw: row.price_raw,
        priceU: row.price_u,
        currency: row.currency,
        signer: row.signer,
        quotedAt: row.quoted_at,
        expiresAt: row.expires_at,
        domain:
          row.domain_chain_id && row.domain_contract
            ? { chainId: row.domain_chain_id, verifyingContract: row.domain_contract }
            : null,
      });
    }
    return found;
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

  enroll(agents: { chainId: number; tokenId: string }[]): void {
    if (agents.length === 0) return;
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO enrolled (chain_id, token_id, enrolled_at)
       VALUES (?, ?, ?)
       ON CONFLICT (chain_id, token_id) DO NOTHING`,
    );
    this.db.exec('BEGIN');
    try {
      for (const agent of agents) {
        insert.run(agent.chainId, agent.tokenId, now);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  enrolledAgents(): { chainId: number; tokenId: string }[] {
    const rows = this.db
      .prepare('SELECT chain_id, token_id FROM enrolled')
      .all() as unknown as { chain_id: number; token_id: string }[];
    return rows.map((r) => ({ chainId: r.chain_id, tokenId: r.token_id }));
  }

  recent(limit: number): ProbeRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM probes ORDER BY probed_at DESC LIMIT ?')
      .all(limit) as unknown as ProbeRow[];
    return rows.map(rowToProbe);
  }

  stats(chainId?: number): StoreStats {
    const probes = readProbeTotals(this.db, chainId);

    const sweeps = this.db
      .prepare('SELECT COUNT(*) AS n FROM sweeps')
      .get() as unknown as { n: number };

    return {
      agentsMonitored: probes.agents,
      agentsAnswering: probes.answering,
      probesTaken: probes.taken,
      probesAnswered: probes.answered,
      sweeps: sweeps.n,
    };
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

/**
 * Left as a relative path on purpose. `path.resolve` on an environment-derived
 * value makes the bundler trace the entire project, and node:sqlite resolves
 * relative paths against the working directory just as well.
 */
const DB_PATH = process.env.PROBE_DB_PATH ?? './data/probes.db';

let cached: ProbeStore | null = null;

/**
 * The process-wide store. Cached because opening SQLite per request would
 * churn file handles under Next's request-per-render model.
 */
export function getProbeStore(): ProbeStore {
  if (cached) return cached;

  cached = new SqliteProbeStore(DB_PATH);
  return cached;
}
