import type { DatabaseSync } from 'node:sqlite';

export interface ProbeTotals {
  taken: number;
  answered: number;
  agents: number;
  answering: number;
}

/**
 * Pokter's own totals, optionally scoped to one chain.
 *
 * Separated from the store so it can be run against a real database in a
 * test. The store is `server-only` and cannot be imported from one, and this
 * query broke the homepage without failing typecheck, lint or the build —
 * the kind of fault only executing the SQL can catch.
 *
 * The scope appears twice, once to ask whether it was given and once to
 * apply it, and it is named rather than numbered: `node:sqlite` rejects
 * SQLite's `?1` spelling with "column index out of range" no matter what is
 * bound to it.
 *
 * Rows marked as Pokter's own measurement error (`probe_corrections`) are
 * left out, as they are everywhere availability is read.
 */
export function readProbeTotals(
  db: DatabaseSync,
  chainId?: number,
): ProbeTotals {
  return db
    .prepare(
      `SELECT COUNT(*) AS taken,
              COALESCE(SUM(ok), 0) AS answered,
              COUNT(DISTINCT chain_id || ':' || token_id) AS agents,
              COUNT(DISTINCT CASE WHEN ok = 1
                    THEN chain_id || ':' || token_id END) AS answering
         FROM probes
        WHERE (:chainId IS NULL OR chain_id = :chainId)
          AND id NOT IN (SELECT probe_id FROM probe_corrections)`,
    )
    .get({ chainId: chainId ?? null }) as unknown as ProbeTotals;
}

/**
 * When each agent on a chain was last probed, keyed by token id.
 *
 * Here rather than in the store for the same reason as `readProbeTotals`: the
 * store is `server-only`, and this file's other query reached production
 * through typecheck, lint and the build before failing on its first row.
 * A bounded sweep decides who it measures from this, so a query that returns
 * nothing would not error — it would quietly sweep the roster in its listed
 * order for ever, and the record of the agents at the back would never
 * refresh. That is a fault worth a test rather than a reading.
 *
 * `idx_probes_agent` is `(chain_id, token_id, probed_at DESC)`, so the
 * grouping is served from the index.
 */
export function readLastProbedAt(db: DatabaseSync, chainId: number): Map<string, string> {
  const rows = db
    .prepare(
      `SELECT token_id, MAX(probed_at) AS last_at
         FROM probes
        WHERE chain_id = :chainId
        GROUP BY token_id`,
    )
    .all({ chainId }) as unknown as { token_id: string; last_at: string }[];

  return new Map(rows.map((row) => [row.token_id, row.last_at]));
}
