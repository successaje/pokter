import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { JobFeedbackContent, UsefulAnswer } from './model';

export interface JobFeedback extends JobFeedbackContent {
  chainId: number;
  jobId: string;
  buyer: string;
  agentChainId: number | null;
  agentTokenId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row per job: a second answer from the same buyer replaces the first and keeps when it was first given. */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS job_feedback (
    chain_id       INTEGER NOT NULL,
    job_id         TEXT NOT NULL,
    buyer          TEXT NOT NULL,
    agent_chain_id INTEGER,
    agent_token_id TEXT,
    answered       TEXT NOT NULL,
    reason         TEXT NOT NULL,
    follow_up      INTEGER NOT NULL,
    contact        TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    PRIMARY KEY (chain_id, job_id)
  );
`;

type Row = { chain_id: number; job_id: string; buyer: string; agent_chain_id: number | null; agent_token_id: string | null; answered: UsefulAnswer; reason: string; follow_up: number; contact: string; created_at: string; updated_at: string };
const fromRow = (r: Row): JobFeedback => ({ chainId: r.chain_id, jobId: r.job_id, buyer: r.buyer, agentChainId: r.agent_chain_id, agentTokenId: r.agent_token_id, answered: r.answered, reason: r.reason, followUp: r.follow_up === 1, contact: r.contact, createdAt: r.created_at, updatedAt: r.updated_at });

class FeedbackStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  get(chainId: number, jobId: string): JobFeedback | null {
    const row = this.db.prepare('SELECT * FROM job_feedback WHERE chain_id = ? AND job_id = ?').get(chainId, jobId) as Row | undefined;
    return row ? fromRow(row) : null;
  }

  upsert(f: Omit<JobFeedback, 'createdAt' | 'updatedAt'>, now = new Date().toISOString()): JobFeedback {
    this.db
      .prepare(
        `INSERT INTO job_feedback (chain_id, job_id, buyer, agent_chain_id, agent_token_id, answered, reason, follow_up, contact, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(chain_id, job_id) DO UPDATE SET answered = excluded.answered, reason = excluded.reason, follow_up = excluded.follow_up, contact = excluded.contact, updated_at = excluded.updated_at`,
      )
      .run(f.chainId, f.jobId, f.buyer.toLowerCase(), f.agentChainId, f.agentTokenId, f.answered, f.reason, f.followUp ? 1 : 0, f.contact, now, now);
    return this.get(f.chainId, f.jobId)!;
  }

  /** Everything, for Pokter's own reading (behind the operator secret). */
  all(): JobFeedback[] {
    return (this.db.prepare('SELECT * FROM job_feedback ORDER BY updated_at DESC').all() as Row[]).map(fromRow);
  }
}

let store: FeedbackStore | null = null;
export function getFeedbackStore(): FeedbackStore {
  store ??= new FeedbackStore(process.env.FEEDBACK_DB_PATH ?? './data/feedback.db');
  return store;
}
