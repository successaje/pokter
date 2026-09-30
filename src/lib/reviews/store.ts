import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { ReviewReportReason, VerifiedReview } from './model';

export interface ReviewReport {
  id: number;
  chainId: number;
  jobId: string;
  reason: ReviewReportReason;
  detail: string;
  createdAt: string;
  status: 'open' | 'dismissed' | 'actioned';
}

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
        visibility TEXT NOT NULL DEFAULT 'published',
        moderated_at TEXT,
        moderation_reason TEXT,
        PRIMARY KEY (chain_id, job_id)
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_agent
        ON reviews (agent_chain_id, agent_token_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS review_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chain_id INTEGER NOT NULL,
        job_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open'
      );
      CREATE INDEX IF NOT EXISTS idx_review_reports_status
        ON review_reports (status, created_at DESC);
    `);
    for (const statement of [
      "ALTER TABLE reviews ADD COLUMN visibility TEXT NOT NULL DEFAULT 'published'",
      'ALTER TABLE reviews ADD COLUMN moderated_at TEXT',
      'ALTER TABLE reviews ADD COLUMN moderation_reason TEXT',
    ]) {
      try { this.db.exec(statement); }
      catch (error) {
        if (!(error instanceof Error) || !/duplicate column name/i.test(error.message)) throw error;
      }
    }
  }

  upsert(review: VerifiedReview): void {
    this.db.prepare(`
      INSERT INTO reviews
        (chain_id, job_id, agent_chain_id, agent_token_id, buyer, rating,
         delivered_as_promised, speed, would_hire_again, comment, signature, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      "SELECT * FROM reviews WHERE agent_chain_id=? AND agent_token_id=? AND visibility='published' ORDER BY updated_at DESC",
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
      visibility: String(row.visibility ?? 'published') as VerifiedReview['visibility'],
    }));
  }

  report(input: { chainId: number; jobId: string; reason: ReviewReportReason; detail: string }): number {
    const review = this.db.prepare('SELECT 1 FROM reviews WHERE chain_id=? AND job_id=?').get(input.chainId, input.jobId);
    if (!review) throw new Error('Review not found.');
    const result = this.db.prepare(
      'INSERT INTO review_reports (chain_id, job_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(input.chainId, input.jobId, input.reason, input.detail, new Date().toISOString());
    return Number(result.lastInsertRowid);
  }

  reports(status: ReviewReport['status'] = 'open'): ReviewReport[] {
    const rows = this.db.prepare(
      'SELECT * FROM review_reports WHERE status=? ORDER BY created_at DESC LIMIT 200',
    ).all(status) as unknown as Array<Record<string, string | number>>;
    return rows.map((row) => ({
      id: Number(row.id), chainId: Number(row.chain_id), jobId: String(row.job_id),
      reason: String(row.reason) as ReviewReportReason, detail: String(row.detail),
      createdAt: String(row.created_at), status: String(row.status) as ReviewReport['status'],
    }));
  }

  moderate(input: { reportId: number; action: 'dismiss' | 'hide' | 'restore'; reason: string }): void {
    const report = this.db.prepare('SELECT * FROM review_reports WHERE id=?').get(input.reportId) as unknown as Record<string, string | number> | undefined;
    if (!report) throw new Error('Report not found.');
    const now = new Date().toISOString();
    this.db.exec('BEGIN');
    try {
      if (input.action === 'hide' || input.action === 'restore') {
        this.db.prepare(
          'UPDATE reviews SET visibility=?, moderated_at=?, moderation_reason=? WHERE chain_id=? AND job_id=?',
        ).run(input.action === 'hide' ? 'hidden' : 'published', now, input.reason, report.chain_id, report.job_id);
      }
      this.db.prepare('UPDATE review_reports SET status=? WHERE id=?').run(
        input.action === 'dismiss' ? 'dismissed' : 'actioned', input.reportId,
      );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

let cached: ReviewStore | null = null;
export function getReviewStore(): ReviewStore {
  return (cached ??= new ReviewStore(DB_PATH));
}
