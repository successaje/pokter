/**
 * Adjudicate the duplicate job rows the store set aside, against the chain.
 *
 *   npx tsx scripts/dedupe-jobs.mts          report only
 *   APPLY=1 npx tsx scripts/dedupe-jobs.mts  correct the surviving rows
 *   JOB_DB_PATH=… to point at a copy of another installation's database
 *
 * The rule itself lives in `job-conflicts.ts`, shared with the operator
 * route that runs this where the data actually is. This opens the database
 * directly rather than through `getJobStore`, which is `server-only` and
 * so unimportable from a script (altana-sdk#88 makes the react-server
 * condition unusable).
 */
import { DatabaseSync } from 'node:sqlite';
import { getErc8183Job, BNB, BNB_TESTNET } from '@altananetwork/sdk';

import { adjudicateJobConflicts } from '../src/lib/erc8183/job-conflicts.js';
import { JOB_CONFLICTS_DDL } from '../src/lib/erc8183/job-dedupe.js';

const path = process.env.JOB_DB_PATH ?? './data/jobs.db';
const apply = process.env.APPLY === '1';
const db = new DatabaseSync(path);
/*
 * Idempotent, and needed: a database the app has not opened since the
 * migration shipped has no conflicts table, and "no such table" is a
 * worse answer than "nothing to adjudicate".
 */
db.exec(JOB_CONFLICTS_DDL);

const outcomes = await adjudicateJobConflicts(
  db,
  async (chainId, jobId) => {
    const job = await getErc8183Job(chainId === 56 ? BNB : BNB_TESTNET, BigInt(jobId));
    return { provider: job.provider as string, description: job.description ?? null };
  },
  { apply },
);

console.log(`${path}: ${outcomes.length} set-aside row(s)${apply ? '' : '  (report only — set APPLY=1 to correct)'}\n`);
for (const o of outcomes) {
  const label = `${o.chainId}/${o.jobId}`.padEnd(9);
  if (o.state === 'agreed') { console.log(`${label} the surviving row matches the chain`); continue; }
  if (o.state === 'unreadable' || o.state === 'no-survivor') { console.log(`${label} ${o.detail}`); continue; }
  console.log(`${label} ${o.state === 'corrected' ? 'corrected from the chain' : 'disagrees with the chain'}`);
  if (o.nowProvider) console.log(`           provider: row ${o.wasProvider} · escrow ${o.nowProvider}`);
  if (o.nowAgent) console.log(`           agent:    row ${o.wasAgent} · envelope ${o.nowAgent}`);
}
const n = (state: string) => outcomes.filter((o) => o.state === state).length;
console.log(`\n${n('agreed')} matched, ${apply ? `${n('corrected')} corrected` : `${n('would-correct')} would be corrected`}`);
