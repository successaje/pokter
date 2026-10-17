import type { HiredJob } from './types';

/**
 * One row per job, at read time.
 *
 * Pokter has two writers and they mint different row ids: `hireAgent` a
 * random UUID at funding time, the chain indexer `"<chainId>:<jobId>"`. The
 * table is keyed on that id, so one job can sit in it twice, and 13 of 124
 * did — the receipts endpoint published 137 rows for 124 jobs, and every
 * count built on them (team-funded, self-hire, outside demand) was about
 * 10% high.
 *
 * `claimed-ids.ts` does not catch these, correctly: it drops a row whose id
 * a later hire for a *different* agent holds, and these agree on the agent.
 * Neither copy is a phantom. They are one job, written twice.
 *
 * Filtered on the way out rather than deleted, which is the same boundary
 * `withoutClaimedIds` keeps: the stored rows are a record of what Pokter
 * did, and a counting bug is not a reason to edit them. A unique index
 * would have ended it at the database instead, and was the first attempt;
 * it was dropped because it has to delete rows to be creatable.
 *
 * The later hire wins, which is the rule `claimed-ids.ts` reasons with —
 * two rules disagreeing about which row is real would be worse than
 * either. Applied after it, so a phantom is already gone and cannot win a
 * comparison on recency.
 */
export function oneRowPerJob(jobs: readonly HiredJob[]): HiredJob[] {
  const keep = new Map<string, HiredJob>();
  for (const job of jobs) {
    const key = `${job.chainId}:${job.jobId}`;
    const held = keep.get(key);
    if (!held) {
      keep.set(key, job);
      continue;
    }
    if (Date.parse(job.hiredAt) > Date.parse(held.hiredAt)) {
      keep.set(key, job);
      continue;
    }
    /*
     * Equal hire times happen: the same job written by both writers from
     * one hire. The chain indexer's row wins then, because only it mints
     * `"<chainId>:<jobId>"` and it built that row by reading the escrow.
     */
    if (Date.parse(job.hiredAt) === Date.parse(held.hiredAt) && job.id === key) {
      keep.set(key, job);
    }
  }
  /* Input order preserved, so callers that sorted upstream still hold. */
  const kept = new Set([...keep.values()].map((job) => job.id));
  return jobs.filter((job) => kept.has(job.id));
}
