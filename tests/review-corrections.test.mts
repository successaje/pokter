import assert from 'node:assert/strict';
import test from 'node:test';

import { checkExampleWallets } from '../src/lib/hire/example-wallet';
import { materialQuoteChange } from '../src/lib/hire/quote-change';
import { readDeliveredAnswer } from '../src/lib/delivery/answer';

const WALLET = '0x0aEe4f0C7D2C2a1B0d1E2F3a4B5c6D7e8F9a0aB7';
const TOKEN = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

/* ── 1. "Use my wallet" is offered for accounts, not for every address ── */

test('an example wallet in the brief is still caught', () => {
  // The failure this file exists for: two mainnet jobs funded against
  // someone else's position. Narrowing the rule must not reopen it.
  const check = checkExampleWallets(`Venus health factor for ${WALLET} and the repay that restores 1.5`, [
    `Venus health factor for ${WALLET}`,
  ]);
  assert.deepEqual(check.exampleWallets, [WALLET.toLowerCase()]);
});

test('a token address in the same brief is not offered the buyer’s wallet', () => {
  const brief = `Check if token ${TOKEN} is safe to buy`;
  const check = checkExampleWallets(brief, [brief]);
  assert.deepEqual(check.exampleWallets, [], 'swapping a token for a wallet would make a brief the agent must refuse');
});

test('pool, vault and contract read the same way', () => {
  for (const noun of ['pool', 'vault', 'contract', 'pair', 'market', 'router']) {
    const brief = `Review the ${noun} ${TOKEN}`;
    assert.deepEqual(checkExampleWallets(brief, [brief]).exampleWallets, [], `"${noun}" should not be a wallet`);
  }
});

test('a JSON brief is judged by its key too', () => {
  const brief = `{"skill":"token_check","token":"${TOKEN}","wallet":"${WALLET}"}`;
  const check = checkExampleWallets(brief, [brief]);
  assert.deepEqual(check.exampleWallets, [WALLET.toLowerCase()], 'the wallet, and only the wallet');
});

test('both kinds in one brief: the account is flagged, the token is not', () => {
  const brief = `Health factor for ${WALLET}, priced against token ${TOKEN}`;
  assert.deepEqual(checkExampleWallets(brief, [brief]).exampleWallets, [WALLET.toLowerCase()]);
});

test('an address with no cue at all is still treated as an account', () => {
  // Under-flagging funds a job against a stranger's position; over-flagging
  // only asks a question. The ambiguous case keeps the safer answer.
  const brief = `Report on ${WALLET}`;
  assert.deepEqual(checkExampleWallets(brief, [brief]).exampleWallets, [WALLET.toLowerCase()]);
});

/* ── 2. A renewed quote is compared on all its signed terms ── */

const quote = (price: string, terms: Record<string, unknown>, currency = '0xU') => ({
  priceRaw: price,
  priceU: Number(price) / 1e18,
  anchor: { currency, terms },
});

const TERMS = { deliverables: 'A JSON assessment', quality_standards: 'Read-only analysis only.' };

test('an identical replacement passes', () => {
  assert.equal(materialQuoteChange(quote('100', TERMS), quote('100', TERMS)), null);
});

test('a changed price is caught, as before', () => {
  const change = materialQuoteChange(quote('100', TERMS), quote('200', TERMS));
  assert.equal(change?.kind, 'price');
});

test('the same price for materially less work is caught', () => {
  /*
   * The gap this closes: price was the only thing compared, so a seller
   * could hold the number and change what it delivers, and the buyer
   * would fund terms they never read.
   */
  const change = materialQuoteChange(quote('100', TERMS), quote('100', { ...TERMS, deliverables: 'A one-line summary' }));
  assert.equal(change?.kind, 'terms');
  assert.match(String(change?.what), /price is the same but what it delivers changed/);
});

test('quality standards and success criteria count too', () => {
  assert.equal(materialQuoteChange(quote('100', TERMS), quote('100', { ...TERMS, quality_standards: 'Best effort.' }))?.kind, 'terms');
  assert.equal(
    materialQuoteChange(quote('100', { ...TERMS, success_criteria: ['a'] }), quote('100', { ...TERMS, success_criteria: ['a', 'b'] }))?.kind,
    'terms',
  );
});

test('reordered success criteria are not a change', () => {
  assert.equal(
    materialQuoteChange(quote('100', { ...TERMS, success_criteria: ['a', 'b'] }), quote('100', { ...TERMS, success_criteria: ['b', 'a'] })),
    null,
  );
});

test('a different payment token is a price change', () => {
  assert.equal(materialQuoteChange(quote('100', TERMS, '0xU'), quote('100', TERMS, '0xUSDT'))?.kind, 'price');
});

test('a quote that names no token does not block the hire over one', () => {
  // Saying nothing is not saying something different.
  assert.equal(materialQuoteChange({ priceRaw: '100', anchor: { terms: TERMS } }, { priceRaw: '100', anchor: { terms: TERMS } }), null);
});

test('a missing anchor compares on price alone, rather than throwing', () => {
  assert.equal(materialQuoteChange({ priceRaw: '100' }, { priceRaw: '100' }), null);
  assert.equal(materialQuoteChange({ priceRaw: '100' }, { priceRaw: '101' })?.kind, 'price');
});

/* ── 3. When a report was written is not when its data was read ── */

const manifest = (metadata: Record<string, unknown>, content: unknown) =>
  JSON.stringify({ metadata, response: { content } });

test('a report that says when it read the data keeps saying so', () => {
  const answer = readDeliveredAnswer(
    manifest({ generated_at: '2026-10-18T12:00:00Z' }, { result: 'ok', as_of: { time: '2026-10-18T09:00:00Z', block: 123 } }),
  );
  assert.equal(answer.asOf?.time, '2026-10-18T09:00:00Z');
  assert.equal(answer.asOf?.block, '123');
  assert.equal(answer.generatedAt, '2026-10-18T12:00:00Z', 'and the write time stays its own fact');
});

test('a report that does not say leaves the reading time unknown', () => {
  /*
   * This used to fall back to generated_at, and the page prints it as
   * "Data read <time>" — so a report composed now from an hour-old
   * reading claimed the reading was now.
   */
  const answer = readDeliveredAnswer(manifest({ generated_at: '2026-10-18T12:00:00Z' }, { result: 'ok' }));
  assert.equal(answer.asOf, null, 'unknown freshness stays unknown');
  assert.equal(answer.generatedAt, '2026-10-18T12:00:00Z', 'but when it was written is still carried');
});

test('unparseable content does not borrow the write time either', () => {
  const answer = readDeliveredAnswer(manifest({ generated_at: '2026-10-18T12:00:00Z' }, 'not json at all'));
  assert.equal(answer.asOf, null);
  assert.equal(answer.generatedAt, '2026-10-18T12:00:00Z');
  assert.equal(answer.raw, 'not json at all');
});
