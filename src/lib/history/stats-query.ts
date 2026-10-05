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
        WHERE (:chainId IS NULL OR chain_id = :chainId)`,
    )
    .get({ chainId: chainId ?? null }) as unknown as ProbeTotals;
}
