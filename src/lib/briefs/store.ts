import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { requestToken } from '@/lib/network/tokens';

import { amountToRaw, type Bid, type Brief, type BriefState } from './model';

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
    /* Added after the first requests were posted; theirs stay null, which reads as "open until awarded". */
    const columns = this.db.prepare('PRAGMA table_info(briefs)').all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === 'closes_at')) this.db.exec('ALTER TABLE briefs ADD COLUMN closes_at TEXT');
    if (!columns.some((c) => c.name === 'category')) this.db.exec('ALTER TABLE briefs ADD COLUMN category TEXT');
    /*
     * The money, added when requests could be priced in more than $U. Rows
     * from before keep NULL in both: their token is the chain's $U by
     * construction (the form offered nothing else), and their raw amount is
     * computed from the signed number at that token's decimals on read
     * (`legacyRaw`), never stored as a guess.
     */
    if (!columns.some((c) => c.name === 'payment_token')) this.db.exec('ALTER TABLE briefs ADD COLUMN payment_token TEXT');
    if (!columns.some((c) => c.name === 'budget_raw')) this.db.exec('ALTER TABLE briefs ADD COLUMN budget_raw TEXT');
    const bidColumns = this.db.prepare('PRAGMA table_info(bids)').all() as Array<{ name: string }>;
    if (!bidColumns.some((c) => c.name === 'payment_token')) this.db.exec('ALTER TABLE bids ADD COLUMN payment_token TEXT');
    if (!bidColumns.some((c) => c.name === 'price_raw')) this.db.exec('ALTER TABLE bids ADD COLUMN price_raw TEXT');
  }

  /*
   * A bid is read with its request's chain and token, because a bid row
   * written before bids carried a token has only the number it signed: its
   * raw amount is that number at its request's token's decimals.
   */
  private static readonly BID_COLUMNS = 'bids.*, briefs.chain_id AS brief_chain_id, briefs.payment_token AS brief_payment_token';
  private static readonly BID_FROM = 'bids LEFT JOIN briefs ON briefs.id = bids.brief_id';

  /**
   * The raw amount of a row stored before amounts were, from the number it
   * signed. '0' only if that number cannot be written in the token's
   * decimals, which the range those rows were validated against rules out;
   * it fits no budget rather than inventing one.
   */
  private static legacyRaw(amount: number, chainId: number | null, paymentToken: string | null): string {
    const token = chainId === null ? null : requestToken(chainId, paymentToken);
    if (!token) return '0';
    return amountToRaw(amount, token.decimals)?.toString() ?? '0';
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
      paymentToken: (row.payment_token as Brief['paymentToken']) ?? null,
      budgetRaw:
        (row.budget_raw as string | null) ??
        BriefStore.legacyRaw(row.budget_u as number, row.chain_id as number, (row.payment_token as string | null) ?? null),
      chainId: row.chain_id as number,
      deliverDays: row.deliver_days as number,
      signature: row.signature as Brief['signature'],
      state: row.state as BriefState,
      postedAt: row.posted_at as string,
      awardedBidId: (row.awarded_bid_id as string | null) ?? null,
      closesAt: (row.closes_at as string | null) ?? null,
      category: (row.category as Brief['category']) ?? null,
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
      paymentToken: (row.payment_token as Bid['paymentToken']) ?? null,
      priceRaw:
        (row.price_raw as string | null) ??
        BriefStore.legacyRaw(
          row.price_u as number,
          (row.brief_chain_id as number | null) ?? null,
          (row.payment_token as string | null) ?? (row.brief_payment_token as string | null) ?? null,
        ),
      deliverDays: row.deliver_days as number,
      note: row.note as string,
      signature: row.signature as Bid['signature'],
      placedAt: row.placed_at as string,
    };
  }

  add(brief: Brief): void {
    this.db
      .prepare(
        `INSERT INTO briefs (id, poster, title, brief, acceptance, fail_signals, budget_u, chain_id, deliver_days, signature, state, posted_at, awarded_bid_id, closes_at, category, payment_token, budget_raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
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
        brief.closesAt ?? null,
        brief.category ?? null,
        brief.paymentToken ?? null,
        brief.budgetRaw,
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
        `INSERT INTO bids (id, brief_id, bidder, agent_chain_id, agent_token_id, price_u, deliver_days, note, signature, placed_at, payment_token, price_raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (brief_id, agent_chain_id, agent_token_id) DO UPDATE SET
           id = excluded.id, bidder = excluded.bidder, price_u = excluded.price_u,
           payment_token = excluded.payment_token, price_raw = excluded.price_raw,
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
        bid.paymentToken ?? null,
        bid.priceRaw,
      );
  }

  bidsFor(briefId: string): Bid[] {
    /* Cheapest first. Every bid on one request is in that request's token, so the order is a price order. */
    const rows = this.db.prepare(`SELECT ${BriefStore.BID_COLUMNS} FROM ${BriefStore.BID_FROM} WHERE bids.brief_id = ? ORDER BY bids.price_u ASC, bids.placed_at ASC`).all(briefId);
    return (rows as Record<string, unknown>[]).map(BriefStore.toBid);
  }

  /** Requests one wallet posted, newest first: the Hiring view's "My requests". */
  byPoster(poster: string): Brief[] {
    const rows = this.db.prepare('SELECT * FROM briefs WHERE poster = ? ORDER BY posted_at DESC').all(poster.toLowerCase());
    return (rows as Record<string, unknown>[]).map(BriefStore.toBrief);
  }

  /** Bids one wallet signed, newest first: the Building view's "My proposals". */
  bidsBy(bidder: string): Bid[] {
    const rows = this.db.prepare(`SELECT ${BriefStore.BID_COLUMNS} FROM ${BriefStore.BID_FROM} WHERE bids.bidder = ? ORDER BY bids.placed_at DESC`).all(bidder.toLowerCase());
    return (rows as Record<string, unknown>[]).map(BriefStore.toBid);
  }

  /** The standing proposal for one agent on one request, if any. */
  bidFor(briefId: string, agentChainId: number, agentTokenId: string): Bid | null {
    const row = this.db
      .prepare(`SELECT ${BriefStore.BID_COLUMNS} FROM ${BriefStore.BID_FROM} WHERE bids.brief_id = ? AND bids.agent_chain_id = ? AND bids.agent_token_id = ?`)
      .get(briefId, agentChainId, agentTokenId);
    return row ? BriefStore.toBid(row as Record<string, unknown>) : null;
  }

  bid(id: string): Bid | null {
    const row = this.db.prepare(`SELECT ${BriefStore.BID_COLUMNS} FROM ${BriefStore.BID_FROM} WHERE bids.id = ?`).get(id);
    return row ? BriefStore.toBid(row as Record<string, unknown>) : null;
  }

  award(briefId: string, bidId: string): void {
    this.db.prepare("UPDATE briefs SET state = 'awarded', awarded_bid_id = ? WHERE id = ? AND state = 'open'").run(bidId, briefId);
  }

  /** Withdrawn by its poster. Only an open request: an awarded one has a builder waiting on it. */
  withdraw(briefId: string): boolean {
    return this.db.prepare("UPDATE briefs SET state = 'cancelled' WHERE id = ? AND state = 'open'").run(briefId).changes > 0;
  }

  /** Each wallet that posted a request, and when it first did. For the operator's counts only. */
  posters(): Array<{ wallet: string; firstAt: string }> {
    return this.db.prepare('SELECT poster AS wallet, MIN(posted_at) AS firstAt FROM briefs GROUP BY poster').all() as Array<{ wallet: string; firstAt: string }>;
  }

  /** Each wallet that bid on a request, and when it first did. */
  bidders(): Array<{ wallet: string; firstAt: string }> {
    return this.db.prepare('SELECT bidder AS wallet, MIN(placed_at) AS firstAt FROM bids GROUP BY bidder').all() as Array<{ wallet: string; firstAt: string }>;
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
