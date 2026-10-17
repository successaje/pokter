/**
 * One row per job, enforced by the database.
 *
 * The `jobs` table was keyed on `id` alone, and its two writers mint
 * different ones: `hireAgent` a random UUID at funding time, the chain
 * indexer `"<chainId>:<jobId>"`. So the same job could be recorded twice,
 * and was — 14 of 124 jobs carried a second row, and job 97/1522 had two
 * naming *different agents*, which credited a delivery to an agent that
 * never made it. The public receipts endpoint counted 138 rows for 124
 * jobs, overstating every figure it publishes by about 11%.
 *
 * The SQL lives here, outside the `server-only` store, so the rule that
 * decides which row survives is testable rather than taken on trust.
 */

/** Rows set aside by the migration, kept so the chain can adjudicate later. */
export const JOB_CONFLICTS_DDL = `
  CREATE TABLE IF NOT EXISTS job_row_conflicts (
    id           TEXT PRIMARY KEY,
    chain_id     INTEGER NOT NULL,
    job_id       TEXT NOT NULL,
    row_json     TEXT NOT NULL,
    set_aside_at TEXT NOT NULL
  );
`;

/**
 * Which rows lose, in the absence of a chain read:
 *
 *  1. keep the one whose id is `"<chainId>:<jobId>"`, because only the
 *     chain indexer mints that and it built the row from the escrow;
 *  2. else the most recently checked against chain;
 *  3. then the newest hire, and finally the id, so two runs agree.
 *
 * Returns the rows to set aside, never the one to keep — a bug here should
 * fail by quarantining nothing, not by quarantining everything.
 */
export const DUPLICATE_LOSERS_SQL = `
  SELECT id, chain_id, job_id FROM jobs WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY chain_id, job_id
        ORDER BY
          CASE WHEN id = chain_id || ':' || job_id THEN 0 ELSE 1 END,
          status_checked_at DESC,
          hired_at DESC,
          id
      ) AS rank FROM jobs
    ) WHERE rank = 1
  )
`;

/**
 * The constraint that makes this unrepeatable.
 *
 * `record` already does INSERT OR REPLACE, and SQLite deletes rows
 * violating any unique constraint — so with this in place the later write
 * wins, and the later write is the chain-derived one.
 */
export const JOB_IDENTITY_INDEX = 'CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_identity ON jobs (chain_id, job_id)';
