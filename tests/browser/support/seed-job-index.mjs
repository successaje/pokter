import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = process.env.POKTER_TEST_DATA_DIR;
if (!dataDir) throw new Error('The browser test data directory is missing.');
const { buyer, provider, jobs } = JSON.parse(readFileSync(0, 'utf8'));
const db = new DatabaseSync(join(dataDir, 'jobs.db'));
try {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO jobs
      (id, job_id, chain_id, is_testnet, agent_chain_id, agent_token_id,
       agent_name, provider, task, budget_raw, expired_at, hired_at,
       status, status_checked_at, client, payment_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const job of jobs) {
    insert.run(
      `${job.chainId}:${job.jobId}`, job.jobId, job.chainId, Number(job.chainId === 97),
      job.chainId, '2618', job.name, provider, 'A funded job to recover',
      '100000000000000000', '2026-10-15T16:10:33.000Z', '2026-10-01T10:00:00.000Z',
      'FUNDED', '2026-11-01T10:00:00.000Z', buyer.toLowerCase(), job.token,
    );
  }
} finally {
  db.close();
}
