import type { DatabaseSync } from 'node:sqlite';

/*
 * A buyer asking an agent that cannot be priced for its price.
 *
 * Kept beside hire attempts, and keyed the same way: a salted hash of who
 * asked, which agent and which day (`attemptFingerprint`). Nothing else
 * about the asker is stored, so an owner learns that there is demand and
 * how much, never who. One ask per person per agent per day: asking again
 * the same day is the same ask.
 *
 * Apart from the store that opens the file, so a test can run the SQL.
 */

export const PRICE_ASK_SCHEMA = `
  CREATE TABLE IF NOT EXISTS price_asks (
    fingerprint TEXT PRIMARY KEY,
    chain_id    INTEGER NOT NULL,
    token_id    TEXT    NOT NULL,
    asked_at    TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_price_asks_agent
    ON price_asks (chain_id, token_id, asked_at DESC);
`;

export function applyPriceAskSchema(db: DatabaseSync): void {
  db.exec(PRICE_ASK_SCHEMA);
}

/** Record an ask. False when the same person already asked for this agent today. */
export function recordPriceAskIn(db: DatabaseSync, ask: { fingerprint: string; chainId: number; tokenId: string; askedAt: string }): boolean {
  return (
    db
      .prepare('INSERT OR IGNORE INTO price_asks (fingerprint, chain_id, token_id, asked_at) VALUES (?, ?, ?, ?)')
      .run(ask.fingerprint, ask.chainId, ask.tokenId, ask.askedAt).changes > 0
  );
}

export interface PriceAskCount {
  chainId: number;
  tokenId: string;
  asks: number;
  latestAt: string;
}

/** Asks since `since` for each of these agents that has any, newest first. */
export function priceAskCountsIn(db: DatabaseSync, agents: ReadonlyArray<{ chainId: number; tokenId: string }>, since: string): PriceAskCount[] {
  if (agents.length === 0) return [];
  const statement = db.prepare(
    'SELECT COUNT(*) AS asks, MAX(asked_at) AS latest_at FROM price_asks WHERE chain_id = ? AND token_id = ? AND asked_at >= ?',
  );
  return agents
    .map((agent) => {
      const row = statement.get(agent.chainId, agent.tokenId, since) as { asks: number; latest_at: string | null } | undefined;
      return row && row.asks > 0 && row.latest_at ? { chainId: agent.chainId, tokenId: agent.tokenId, asks: Number(row.asks), latestAt: row.latest_at } : null;
    })
    .filter((count): count is PriceAskCount => count !== null)
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

export function prunePriceAsksIn(db: DatabaseSync, before: string): void {
  db.prepare('DELETE FROM price_asks WHERE asked_at < ?').run(before);
}
