/**
 * One row per job, enforced by the database.
 *
 * `hire-confirm.ts` stopped new duplicates at the source and
 * `claimed-ids.ts` hides the one that named the wrong agent, but the rows
 * are still there: 13 of 124 jobs carry a second copy, recorded by the
 * two writers that mint different ids — `hireAgent` a random UUID at
 * funding time, the chain indexer `"<chainId>:<jobId>"`. `withoutClaimedIds`
 * keeps both when they agree on the agent, correctly, because neither is a
 * phantom; so the receipts endpoint still publishes 137 rows for 124 jobs
 * and every count built on them stays about 10% high.
 *
 * A unique index ends it at the level where it cannot recur, whichever
 * code path writes. The SQL lives here, outside the `server-only` store,
 * so the rule that decides which row survives is testable rather than
 * taken on trust.
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
 * Which rows lose.
 *
 * The same rule `claimed-ids.ts` reasons with, so the two cannot disagree
 * about which row is real: **the later hire wins**. A hire predicts its
 * job id before sending, so a row claiming an id before anything existed
 * there is the phantom, and the hire that actually created the job
 * recorded itself afterwards.
 *
 * The chain-form id breaks a tie, because only the chain indexer mints
 * `"<chainId>:<jobId>"` and it built that row by reading the escrow. The
 * id itself is last, so two runs of the migration agree.
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
          hired_at DESC,
          CASE WHEN id = chain_id || ':' || job_id THEN 0 ELSE 1 END,
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
