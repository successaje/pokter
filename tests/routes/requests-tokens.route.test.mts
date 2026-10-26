import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/*
 * The request store across the change that gave requests a token. Run under
 * the server conditions because the store is `server-only`.
 *
 * A database from before has no token columns. Its rows must survive the
 * migration, keep NULL (a request from that form was $U by construction),
 * and still read with a raw amount computed at $U's decimals — not stored
 * as a guess, and not called unknown.
 */

const USDT56 = '0x55d398326f99059fF775485246999027B3197955';

const dir = mkdtempSync(join(tmpdir(), 'pokter-requests-tokens-'));
const path = join(dir, 'briefs.db');
process.env.BRIEF_DB_PATH = path;

test('a legacy request and its proposal read as $U after the migration, and a USDT one round-trips', async () => {
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE briefs (id TEXT PRIMARY KEY, poster TEXT NOT NULL, title TEXT NOT NULL, brief TEXT NOT NULL, acceptance TEXT NOT NULL, fail_signals TEXT NOT NULL, budget_u REAL NOT NULL, chain_id INTEGER NOT NULL, deliver_days INTEGER NOT NULL, signature TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'open', posted_at TEXT NOT NULL, awarded_bid_id TEXT, closes_at TEXT, category TEXT);
    CREATE TABLE bids (id TEXT PRIMARY KEY, brief_id TEXT NOT NULL, bidder TEXT NOT NULL, agent_chain_id INTEGER NOT NULL, agent_token_id TEXT NOT NULL, price_u REAL NOT NULL, deliver_days INTEGER NOT NULL, note TEXT NOT NULL, signature TEXT NOT NULL, placed_at TEXT NOT NULL, UNIQUE (brief_id, agent_chain_id, agent_token_id));
  `);
  legacy.prepare(`INSERT INTO briefs (id, poster, title, brief, acceptance, fail_signals, budget_u, chain_id, deliver_days, signature, posted_at) VALUES ('old', '0xabc', 'T', 'B', '["a"]', '[]', 1.5, 97, 3, '0x', '2026-10-01T00:00:00.000Z')`).run();
  legacy.prepare(`INSERT INTO bids (id, brief_id, bidder, agent_chain_id, agent_token_id, price_u, deliver_days, note, signature, placed_at) VALUES ('oldbid', 'old', '0xdef', 97, '2554', 1.25, 3, 'n', '0x', '2026-10-02T00:00:00.000Z')`).run();
  legacy.close();

  const { getBriefStore } = await import('../../src/lib/briefs/store');
  const store = getBriefStore();

  const brief = store.get('old');
  assert.equal(brief?.paymentToken, null, 'kept NULL: $U by construction, not rewritten');
  assert.equal(brief?.budgetRaw, '1500000000000000000', 'raw at $U’s decimals, from the signed number');
  const [bid] = store.bidsFor('old');
  assert.equal(bid.paymentToken, null);
  assert.equal(bid.priceRaw, '1250000000000000000');
  assert.equal(store.bid('oldbid')?.priceRaw, '1250000000000000000');

  store.add({
    id: 'new',
    poster: '0x0000000000000000000000000000000000000abc',
    title: 'T',
    brief: 'B',
    acceptance: ['a'],
    failSignals: [],
    budgetU: 5,
    paymentToken: USDT56,
    budgetRaw: '5000000000000000000',
    chainId: 56,
    deliverDays: 3,
    signature: '0x',
    state: 'open',
    postedAt: '2026-10-26T00:00:00.000Z',
    awardedBidId: null,
    closesAt: null,
    category: null,
  });
  store.placeBid({
    id: 'newbid',
    briefId: 'new',
    bidder: '0x0000000000000000000000000000000000000def',
    agentChainId: 56,
    agentTokenId: '1',
    priceU: 4,
    paymentToken: USDT56,
    priceRaw: '4000000000000000000',
    deliverDays: 3,
    note: 'n',
    signature: '0x',
    placedAt: '2026-10-26T00:01:00.000Z',
  });
  assert.equal(store.get('new')?.paymentToken, USDT56);
  assert.equal(store.get('new')?.budgetRaw, '5000000000000000000');
  assert.equal(store.bidFor('new', 56, '1')?.paymentToken, USDT56);
  assert.equal(store.bidFor('new', 56, '1')?.priceRaw, '4000000000000000000');
});
