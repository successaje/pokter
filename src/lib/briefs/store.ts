import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Bid, Brief, BriefState } from './model';

const DB_PATH = process.env.BRIEF_DB_PATH ?? './data/briefs.db';

/**
 * Briefs and the bids on them.
 *
 * Its own file rather than a table in `jobs.db`, because a brief is not a
 * job: nothing is funded, no escrow exists, and the two have different
 * lifetimes. A brief that is never awarded should not have to be explained
 * away in a table whose every other row is money.
 */
class BriefStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS briefs (
        id TEXT PRIMARY KEY,
        poster TEXT NOT NULL,
        title TEXT NOT NULL,
        brief TEXT NOT NULL,
        acceptance TEXT NOT NULL,
        fail_signals TEXT NOT NULL,
        budget_u REAL NOT NULL,
        chain_id INTEGER NOT NULL,
        deliver_days INTEGER NOT NULL,
        signature TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'open',
        posted_at TEXT NOT NULL,
        awarded_bid_id TEXT
      );
      CREATE TABLE IF NOT EXISTS bids (
        id TEXT PRIMARY KEY,
        brief_id TEXT NOT NULL,
        bidder TEXT NOT NULL,
        agent_chain_id INTEGER NOT NULL,
        agent_token_id TEXT NOT NULL,
        price_u REAL NOT NULL,
        deliver_days INTEGER NOT NULL,
        note TEXT NOT NULL,
        signature TEXT NOT NULL,
        placed_at TEXT NOT NULL,
        /* One standing offer per agent per brief: a second bid replaces the
           first rather than stacking, so a board cannot be filled by one
           bidder reposting. */
        UNIQUE (brief_id, agent_chain_id, agent_token_id)
      );
      CREATE INDEX IF NOT EXISTS bids_by_brief ON bids (brief_id);
    `);
  }

  private static toBrief(row: Record<string, unknown>): Brief {
    return {
      id: row.id as string,
      poster: row.poster as Brief['poster'],
      title: row.title as string,
      brief: row.brief as string,
      acceptance: JSON.parse(row.acceptance as string) as string[],
      failSignals: JSON.parse(row.fail_signals as string) as string[],
      budgetU: row.budget_u as number,
      chainId: row.chain_id as number,
      deliverDays: row.deliver_days as number,
      signature: row.signature as Brief['signature'],
      state: row.state as BriefState,
      postedAt: row.posted_at as string,
      awardedBidId: (row.awarded_bid_id as string | null) ?? null,
    };
  }

  private static toBid(row: Record<string, unknown>): Bid {
    return {
      id: row.id as string,
      briefId: row.brief_id as string,
      bidder: row.bidder as Bid['bidder'],
      agentChainId: row.agent_chain_id as number,
      agentTokenId: row.agent_token_id as string,
      priceU: row.price_u as number,
      deliverDays: row.deliver_days as number,
      note: row.note as string,
      signature: row.signature as Bid['signature'],
      placedAt: row.placed_at as string,
    };
  }

  add(brief: Brief): void {
    this.db
      .prepare(
        `INSERT INTO briefs (id, poster, title, brief, acceptance, fail_signals, budget_u, chain_id, deliver_days, signature, state, posted_at, awarded_bid_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        brief.id,
        brief.poster.toLowerCase(),
        brief.title,
        brief.brief,
        JSON.stringify(brief.acceptance),
        JSON.stringify(brief.failSignals),
        brief.budgetU,
        brief.chainId,
        brief.deliverDays,
        brief.signature,
        brief.state,
        brief.postedAt,
      );
  }

  all(state?: BriefState): Brief[] {
    const rows = state
      ? this.db.prepare('SELECT * FROM briefs WHERE state = ? ORDER BY posted_at DESC').all(state)
      : this.db.prepare('SELECT * FROM briefs ORDER BY posted_at DESC').all();
    return (rows as Record<string, unknown>[]).map(BriefStore.toBrief);
  }

  get(id: string): Brief | null {
    const row = this.db.prepare('SELECT * FROM briefs WHERE id = ?').get(id);
    return row ? BriefStore.toBrief(row as Record<string, unknown>) : null;
  }

  placeBid(bid: Bid): void {
    this.db
      .prepare(
        `INSERT INTO bids (id, brief_id, bidder, agent_chain_id, agent_token_id, price_u, deliver_days, note, signature, placed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (brief_id, agent_chain_id, agent_token_id) DO UPDATE SET
           id = excluded.id, bidder = excluded.bidder, price_u = excluded.price_u,
           deliver_days = excluded.deliver_days, note = excluded.note,
           signature = excluded.signature, placed_at = excluded.placed_at`,
      )
      .run(
        bid.id,
        bid.briefId,
        bid.bidder.toLowerCase(),
        bid.agentChainId,
        bid.agentTokenId,
        bid.priceU,
        bid.deliverDays,
        bid.note,
        bid.signature,
        bid.placedAt,
      );
  }

  bidsFor(briefId: string): Bid[] {
    const rows = this.db.prepare('SELECT * FROM bids WHERE brief_id = ? ORDER BY price_u ASC, placed_at ASC').all(briefId);
    return (rows as Record<string, unknown>[]).map(BriefStore.toBid);
  }

  bid(id: string): Bid | null {
    const row = this.db.prepare('SELECT * FROM bids WHERE id = ?').get(id);
    return row ? BriefStore.toBid(row as Record<string, unknown>) : null;
  }

  award(briefId: string, bidId: string): void {
    this.db.prepare("UPDATE briefs SET state = 'awarded', awarded_bid_id = ? WHERE id = ? AND state = 'open'").run(bidId, briefId);
  }

  countOpen(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM briefs WHERE state = 'open'").get() as { n: number };
    return row.n;
  }
}

let store: BriefStore | null = null;
export function getBriefStore(): BriefStore {
  store ??= new BriefStore(DB_PATH);
  return store;
}
