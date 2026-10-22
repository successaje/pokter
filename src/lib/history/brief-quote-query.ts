import type { DatabaseSync } from 'node:sqlite';

/**
 * The last signed quote a buyer's own brief got from one agent.
 *
 * Separated from the store so it can be run against a real database in a
 * test, the way `stats-query` is: the store is `server-only` and cannot be
 * imported from one, and the write below decides *which payability verdict
 * survives*, which is not something typecheck or lint can check.
 */
export interface BriefQuoteRow {
  quotedAt: string;
  /** Whether an enabled escrow settles the currency it signed (`escrowChainForCurrency`). */
  payable: boolean;
}

/**
 * Record a quote, keeping the later of the two.
 *
 * One row per agent, and `payable` travels with `quoted_at`: keeping the
 * newest timestamp while leaving an older row's verdict behind would let a
 * payable quote from last week vouch for an unpayable one signed today.
 *
 * `>=`, not `>`. Two quotes can land in the same millisecond — both routes
 * write this row, and ISO-8601 stops at milliseconds — and refusing the
 * second would keep the earlier verdict for a quote Pokter had already
 * replaced. Equal timestamps are the same instant, so the later write wins.
 */
export function writeBriefQuote(db: DatabaseSync, chainId: number, tokenId: string, quote: BriefQuoteRow): void {
  db.prepare(
    `INSERT INTO brief_quotes (chain_id, token_id, quoted_at, payable) VALUES (?, ?, ?, ?)
       ON CONFLICT (chain_id, token_id) DO UPDATE SET quoted_at = excluded.quoted_at, payable = excluded.payable
       WHERE excluded.quoted_at >= brief_quotes.quoted_at`,
  ).run(chainId, tokenId, quote.quotedAt, quote.payable ? 1 : 0);
}

/** The stored quote, or null. A missing `payable` reads as unpayable, which is the safe direction. */
export function readBriefQuote(db: DatabaseSync, chainId: number, tokenId: string): BriefQuoteRow | null {
  const row = db.prepare('SELECT quoted_at, payable FROM brief_quotes WHERE chain_id = ? AND token_id = ?').get(chainId, tokenId) as
    | { quoted_at: string; payable: number | null }
    | undefined;
  return row ? { quotedAt: row.quoted_at, payable: row.payable === 1 } : null;
}
