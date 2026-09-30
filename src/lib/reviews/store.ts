import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { VerifiedReview } from './model';

const DB_PATH = process.env.REVIEW_DB_PATH ?? './data/reviews.db';

class ReviewStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS reviews (
        chain_id INTEGER NOT NULL,
        job_id TEXT NOT NULL,
        agent_chain_id INTEGER NOT NULL,
        agent_token_id TEXT NOT NULL,
        buyer TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        delivered_as_promised INTEGER NOT NULL,
        speed TEXT NOT NULL CHECK (speed IN ('early', 'on-time', 'late')),
        would_hire_again INTEGER NOT NULL,
        comment TEXT NOT NULL,
        signature TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (chain_id, job_id)
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_agent
        ON reviews (agent_chain_id, agent_token_id, updated_at DESC);
    `);
  }

  upsert(review: VerifiedReview): void {
    this.db.prepare(`
      INSERT INTO reviews VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chain_id, job_id) DO UPDATE SET
        rating=excluded.rating,
        delivered_as_promised=excluded.delivered_as_promised,
        speed=excluded.speed,
        would_hire_again=excluded.would_hire_again,
        comment=excluded.comment,
        signature=excluded.signature,
        updated_at=excluded.updated_at
    `).run(
      review.chainId, review.jobId, review.agentChainId, review.agentTokenId,
      review.buyer, review.rating, review.deliveredAsPromised ? 1 : 0,
      review.speed, review.wouldHireAgain ? 1 : 0, review.comment,
      review.signature, review.updatedAt,
    );
  }

  byAgent(chainId: number, tokenId: string): VerifiedReview[] {
    const rows = this.db.prepare(
      'SELECT * FROM reviews WHERE agent_chain_id=? AND agent_token_id=? ORDER BY updated_at DESC',
    ).all(chainId, tokenId) as unknown as Array<Record<string, string | number>>;
    return rows.map((row) => ({
      chainId: Number(row.chain_id), jobId: String(row.job_id),
      agentChainId: Number(row.agent_chain_id), agentTokenId: String(row.agent_token_id),
      buyer: String(row.buyer) as VerifiedReview['buyer'], rating: Number(row.rating),
      deliveredAsPromised: Number(row.delivered_as_promised) === 1,
      speed: String(row.speed) as VerifiedReview['speed'],
      wouldHireAgain: Number(row.would_hire_again) === 1,
      comment: String(row.comment), signature: String(row.signature) as VerifiedReview['signature'],
      updatedAt: String(row.updated_at),
    }));
  }
}

let cached: ReviewStore | null = null;
export function getReviewStore(): ReviewStore {
  return (cached ??= new ReviewStore(DB_PATH));
}
