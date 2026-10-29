import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { priceAskCopy } from '../src/lib/agents/price-ask-alerts';
import { attemptFingerprint } from '../src/lib/builder/diagnostics/attempt';
import { applyPriceAskSchema, priceAskCountsIn, prunePriceAsksIn, recordPriceAskIn } from '../src/lib/builder/diagnostics/price-ask-sql';

/*
 * "Ask for a price", on an agent that cannot be priced. The ask is counted
 * without saying who; the owner is told, with the fix. The hire still
 * needs the agent's own signed price.
 */

const fresh = () => {
  const db = new DatabaseSync(':memory:');
  applyPriceAskSchema(db);
  return db;
};
const key = (clientKey: string, day: string, tokenId = '2618') =>
  attemptFingerprint({ salt: 'salt', clientKey, chainId: 97, tokenId, brief: 'price-ask', day });

test('one ask per person per agent per day, counted without saying who', () => {
  const db = fresh();
  assert.equal(recordPriceAskIn(db, { fingerprint: key('a', '2026-10-29'), chainId: 97, tokenId: '2618', askedAt: '2026-10-29T10:00:00Z' }), true);
  assert.equal(recordPriceAskIn(db, { fingerprint: key('a', '2026-10-29'), chainId: 97, tokenId: '2618', askedAt: '2026-10-29T11:00:00Z' }), false, 'the same person again the same day');
  assert.equal(recordPriceAskIn(db, { fingerprint: key('b', '2026-10-29'), chainId: 97, tokenId: '2618', askedAt: '2026-10-29T12:00:00Z' }), true);
  assert.equal(recordPriceAskIn(db, { fingerprint: key('a', '2026-10-30'), chainId: 97, tokenId: '2618', askedAt: '2026-10-30T09:00:00Z' }), true, 'the next day is new demand');
  const columns = (db.prepare('PRAGMA table_info(price_asks)').all() as Array<{ name: string }>).map((c) => c.name);
  assert.deepEqual(columns, ['fingerprint', 'chain_id', 'token_id', 'asked_at'], 'no address, no text');
  const [count] = priceAskCountsIn(db, [{ chainId: 97, tokenId: '2618' }], '2026-10-01T00:00:00Z');
  assert.deepEqual(count, { chainId: 97, tokenId: '2618', asks: 3, latestAt: '2026-10-30T09:00:00Z' });
});

test('counts cover the window asked for, per agent, and an agent nobody asked about is left out', () => {
  const db = fresh();
  recordPriceAskIn(db, { fingerprint: key('a', '2026-09-01'), chainId: 97, tokenId: '2618', askedAt: '2026-09-01T10:00:00Z' });
  recordPriceAskIn(db, { fingerprint: key('a', '2026-10-29', '7'), chainId: 97, tokenId: '7', askedAt: '2026-10-29T10:00:00Z' });
  const counts = priceAskCountsIn(db, [{ chainId: 97, tokenId: '2618' }, { chainId: 97, tokenId: '7' }, { chainId: 56, tokenId: '7' }], '2026-09-29T00:00:00Z');
  assert.deepEqual(counts.map((c) => `${c.chainId}:${c.tokenId}=${c.asks}`), ['97:7=1'], 'the September ask is outside the window');
  prunePriceAsksIn(db, '2026-10-01T00:00:00Z');
  assert.equal(priceAskCountsIn(db, [{ chainId: 97, tokenId: '2618' }], '2026-01-01T00:00:00Z').length, 0, 'pruned with the attempts');
});

test('the owner’s alert names the agent and the count, and points at the fix', () => {
  assert.deepEqual(priceAskCopy({ chainId: 97, tokenId: '7', name: 'Gridloom', asks: 1, latestAt: '2026-10-29T10:00:00Z' }).title, 'A buyer asked for Gridloom’s price');
  const many = priceAskCopy({ chainId: 97, tokenId: '7', name: 'Gridloom', asks: 3, latestAt: '2026-10-29T10:00:00Z' });
  assert.equal(many.title, '3 buyers asked for Gridloom’s price');
  assert.match(many.body, /asked while it could not be priced/, 'true whether or not it has been fixed since');
});

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('only an agent that cannot be priced, for a reason that will not pass, is asked for', () => {
  const route = source('src/app/api/price-asks/route.ts');
  const post = route.slice(route.indexOf('export async function POST'), route.indexOf('export async function GET'));
  const order = ['consumeRateLimit(', 'currentHireBlockerWithCard(', "if (!blocker)", 'blocker.transient', 'recordPriceAsk('].map((n) => post.indexOf(n));
  assert.ok(order.every((i) => i >= 0), 'each step is there');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'checked before anything is recorded');
  assert.match(source('src/features/agent/HirePanel.tsx'), /\{!profile\.hireBlocker\.transient && <AskForPrice /);
});

test('the owner is told in the bell, the inbox and Building, and the badge clears with the list', () => {
  const bell = source('src/shell/NotificationBell.tsx');
  assert.match(bell, /usePriceAskAlertSync\(\);/);
  assert.match(bell, /\.\.\.priceAskAlerts\.map/);
  assert.match(bell, /markPriceAskAlertsRead\(address\)/);
  assert.match(bell, /markPriceAskAlertRead\(item\.id\)/);
  const inbox = source('src/features/workspace/Pages.tsx');
  assert.match(inbox, /kind: 'price-ask' as const/);
  assert.match(inbox, /markPriceAskAlertsRead\(address\)/);
  assert.match(source('src/app/(site)/build/(section)/agents/[chainId]/[tokenId]/page.tsx'), /buyers asked for its price/);
});
