import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { catalogueChanged, catalogueVersion } from '../src/lib/catalogue-version';
import { decideHireBlocker, latestPriceCheck } from '../src/lib/hire/blocker';

/*
 * A failed fresh check and an unchanged listing could coexist: the sweep
 * keeps the last signed quote when a later request fails, and the blocker
 * returned "nothing blocking" whenever that quote existed. The price stays,
 * dated; the newer check is said beside it; and lists rebuild when a check
 * is stored rather than when their minute runs out.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const now = Date.parse('2026-10-27T18:00:00Z');
const quote = { quotedAt: '2026-10-25T10:00:00Z' };
const base = { agentWallet: '0x75A0000000000000000000000000000000006B19', protocols: ['a2a'], quote, payable: true, brief: null, card: null, now } as const;

test('a lasting failure since the last signed price is shown, not hidden by it', () => {
  assert.equal(decideHireBlocker({ ...base, failed: null }), null, 'a payable quote and nothing since: nothing blocking');
  const since = decideHireBlocker({ ...base, failed: { code: 'no-price-skill', observedAt: '2026-10-27T09:00:00Z' } });
  assert.equal(since?.code, 'no-price-skill');
  assert.equal(since?.observedAt, '2026-10-27T09:00:00Z');
  assert.equal(since?.from, 'sweep');
  /* A check that did not complete says nothing new: the price stands. */
  assert.equal(decideHireBlocker({ ...base, failed: { code: 'timeout', observedAt: '2026-10-27T09:00:00Z' } }), null);
  /* A failure older than the quote has been answered by it. */
  assert.equal(decideHireBlocker({ ...base, failed: { code: 'no-quote', observedAt: '2026-10-24T09:00:00Z' } }), null);
  /* A newer signed quote for a buyer's brief still disproves the stale pricing failure, as before. */
  assert.equal(decideHireBlocker({ ...base, failed: { code: 'no-quote', observedAt: '2026-10-26T09:00:00Z' }, brief: { quotedAt: '2026-10-27T08:00:00Z', payable: true } }), null);
  /* An unpayable quote with nothing since is still the payment problem. */
  assert.equal(decideHireBlocker({ ...base, payable: false, failed: null })?.code, 'payment-incompatible');
});

test('the latest price check is dated and sourced, and a buyer’s request counts only when it signed', () => {
  assert.deepEqual(latestPriceCheck({ quote, failed: { code: 'no-quote', observedAt: '2026-10-27T09:00:00Z' }, brief: null }), { at: '2026-10-27T09:00:00Z', outcome: 'no-quote', source: 'scheduled' });
  assert.deepEqual(latestPriceCheck({ quote, failed: { code: 'no-quote', observedAt: '2026-10-26T09:00:00Z' }, brief: { quotedAt: '2026-10-27T08:00:00Z', payable: true } }), { at: '2026-10-27T08:00:00Z', outcome: 'signed', source: 'buyer' });
  assert.deepEqual(latestPriceCheck({ quote, failed: null, brief: null }), { at: quote.quotedAt, outcome: 'signed', source: 'scheduled' });
  assert.equal(latestPriceCheck({ quote: null, failed: null, brief: null }), null);
  const page = code('app/(site)/agents/[chainId]/[tokenId]/page.tsx');
  assert.match(page, /label: 'Last price check'/);
  assert.match(page, /Date\.parse\(p\.priceCheck\.at\) > Date\.parse\(p\.quote\.quotedAt\)/, 'shown when it is newer than the price');
});

test('storing a price check rebuilds the catalogue on its next read', () => {
  const before = catalogueVersion();
  catalogueChanged();
  assert.equal(catalogueVersion(), before + 1);
  assert.match(code('lib/marketplace.ts'), /hit\.version === catalogueVersion\(\)/);
  const store = code('lib/history/store.ts');
  for (const method of ['recordQuotes(quotes: QuoteRecord[]): void {\n    if (quotes.length === 0) return;\n    catalogueChanged();', 'recordQuoteOutcomes(failed: QuoteFailureRecord[], quoted: { chainId: number; tokenId: string }[]): void {\n    if (failed.length === 0 && quoted.length === 0) return;\n    catalogueChanged();', 'noteBriefQuote(chainId: number, tokenId: string, quote: { payable: boolean; at?: string }): void {\n    catalogueChanged();']) {
    assert.ok(store.includes(method), method.split('(')[0]);
  }
});

test('responses say when they were built, under a name that means it, and the change is recorded unreleased', async () => {
  assert.match(code('lib/api/v1.ts'), /generatedAt,\s*observedAt: generatedAt,/);
  assert.match(code('app/api/v1/agents/[chainId]/[tokenId]/route.ts'), /generatedAt,\s*observedAt: generatedAt,/);
  assert.match(code('app/api/v1/agents/[chainId]/[tokenId]/route.ts'), /priceCheck: priceCheck/);
  const { API_CHANGES } = await import('../src/lib/api/changes');
  const entry = API_CHANGES[0];
  assert.equal(entry.date, null);
  assert.equal(entry.release, null);
  assert.equal(entry.kind, 'changed');
  assert.match(entry.details.join(' '), /`generatedAt`/);
});

test('the API asks the record before its payable-quote shortcut, so it says what the agent page says', () => {
  const live = code('lib/hire/blocker-live.ts');
  const wrapper = live.slice(live.indexOf('export async function currentHireBlockerWithCard'));
  assert.ok(wrapper.indexOf('const onRecord = currentHireBlocker(agent, quote, payable);') < wrapper.indexOf('if (quote && payable !== false) return null;'));
  assert.ok(wrapper.indexOf('if (quote && payable !== false) return null;') < wrapper.indexOf('await readCardForPage('), 'and still reads no card when a payable quote stands');
});
