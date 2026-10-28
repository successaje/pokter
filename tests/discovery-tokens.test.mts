import assert from 'node:assert/strict';
import test from 'node:test';

/*
 * Discovery and the buyer-facing surfaces name a price in the money it is
 * signed in. Every one of these used to print "$U" beside whatever number
 * the quote carried, and one agent in the catalogue signs in BNB Chain
 * USDT — so these pin the label to the quote's own token, an unknown token
 * to "unknown", and keep the $U-only figures (suggestions) free of USDT.
 */

const MAINNET_U = '0xcE24439F2D9C6a2289F741120FE202248B666666';
const MAINNET_USDT = '0x55d398326f99059fF775485246999027B3197955';
const UNKNOWN = '0x1234567890abcdef1234567890abcdef12345678';

test('a card priced in USDT says USDT, never $U', async () => {
  /* `toFindRow` is server-only through the marketplace; the label it uses is `quotePriceLabel`, asserted here. */
  const { quotePriceLabel } = await import('../src/lib/find/price');
  const label = quotePriceLabel({ priceU: 0.5, priceRaw: '500000000000000000', currency: MAINNET_USDT });
  assert.equal(label, '0.5 USDT');
  assert.doesNotMatch(label, /\$U/);
  assert.equal(quotePriceLabel({ priceU: 0.1, priceRaw: '100000000000000000', currency: MAINNET_U }), '0.1 $U');
  assert.equal(quotePriceLabel({ priceU: 0, priceRaw: '0', currency: MAINNET_USDT }), 'Free');
  assert.equal(quotePriceLabel({ priceU: 0.5, currency: MAINNET_USDT }), '0.5 USDT', 'from the number when no raw units were recorded');
});

test('a price in an unknown currency is said to be unknown', async () => {
  const { formatQuotedPrice, formatQuotedRaw } = await import('../src/lib/erc8183/pricing');
  assert.equal(formatQuotedPrice(0.5, null), '0.5 (currency unknown)');
  assert.match(formatQuotedRaw(null, '500'), /currency unknown/);
  assert.doesNotMatch(formatQuotedRaw(UNKNOWN, '500'), /\$U|USDT/);
});

test('a suggestion is a median of $U prices only', async () => {
  const { suggestionsByCategory, isDollarUPrice } = await import('../src/lib/find/suggested');
  const s = suggestionsByCategory([
    { category: 'x', priceU: 0.1, currency: MAINNET_U },
    { category: 'x', priceU: 0.1, currency: MAINNET_U },
    { category: 'x', priceU: 0.1, currency: MAINNET_U },
    // Three USDT prices at 5 would drag a mixed median to 2 or 5.
    { category: 'x', priceU: 5, currency: MAINNET_USDT },
    { category: 'x', priceU: 5, currency: MAINNET_USDT },
    { category: 'x', priceU: 5, currency: MAINNET_USDT },
    { category: 'x', priceU: 5, currency: MAINNET_USDT },
    // And a missing currency is not assumed to be $U.
    { category: 'x', priceU: 5, currency: null },
  ]);
  assert.equal(s.get('x')!.u, 0.1);
  assert.equal(s.get('x')!.sample, 3);
  assert.equal(isDollarUPrice(MAINNET_USDT), false);
  assert.equal(isDollarUPrice(null), false);
  assert.equal(isDollarUPrice(MAINNET_U.toLowerCase()), true);
});

test('structured data publishes no offer in a token Pokter has not verified', async () => {
  const { agentJsonLd } = await import('../src/lib/seo/agent-jsonld');
  const base = { name: 'Keel', summary: 'Agent', chainId: 56, tokenId: '1', owner: '0xb7', imageUrl: null, categoryLabel: null, record: { totalProbes: 0, totalAnswered: 0 } };
  assert.equal(agentJsonLd('https://pokter.xyz', { ...base, quote: { priceU: 1, currency: UNKNOWN, expiresAt: null, payable: true } }).offers, undefined);
  const usdt = agentJsonLd('https://pokter.xyz', { ...base, quote: { priceU: 1, currency: MAINNET_USDT, expiresAt: null, payable: true } }) as { offers: Record<string, unknown> };
  assert.equal(usdt.offers.priceCurrency, 'USDT', 'the registry symbol');
});

test('a renewed quote in another currency is reported as a currency change', async () => {
  const { materialQuoteChange } = await import('../src/lib/hire/quote-change');
  const change = materialQuoteChange(
    { priceRaw: '100000000000000000', currency: MAINNET_U },
    { priceRaw: '100000000000000000', currency: MAINNET_USDT },
  );
  assert.equal(change?.kind, 'price');
  assert.match(String(change?.what), /the currency changed from \$U to USDT/);

  // And a price change in USDT is said in USDT.
  const moved = materialQuoteChange(
    { priceRaw: '100000000000000000', anchor: { currency: MAINNET_USDT } },
    { priceRaw: '200000000000000000', anchor: { currency: MAINNET_USDT } },
  );
  assert.match(String(moved?.what), /its new price is 0\.2 USDT, not the 0\.1 USDT/);
});

test('a saved agent that changes currency at the same number is a price change', async () => {
  const { savedAgentChanges } = await import('../src/lib/wallet/saved-agents');
  const saved = [{ chainId: 56, tokenId: '1', name: 'Keel', imageUrl: null, category: 'yield', description: 'Agent', savedAt: '2026-01-01T00:00:00Z' }];
  const before = { chainId: 56, tokenId: '1', evidence: 'observed', response: 'responding' as const, priceU: 0.1, currency: MAINNET_U, checkedAt: '2026-01-01T00:00:00Z' };
  const after = { ...before, currency: MAINNET_USDT, checkedAt: '2026-01-02T00:00:00Z' };
  const alerts = savedAgentChanges([before], [after], saved);
  assert.deepEqual(alerts.map((a) => a.kind), ['price']);
  assert.match(alerts[0].body, /currency changed from \$U to USDT: 0\.1 \$U → 0\.1 USDT/);

  // The same currency in another case is not a change; nor is a snapshot stored before currencies were.
  assert.deepEqual(savedAgentChanges([before], [{ ...before, currency: MAINNET_U.toLowerCase(), checkedAt: '2026-01-03T00:00:00Z' }], saved), []);
  const legacy: Omit<typeof before, 'currency'> & { currency?: string } = { ...before };
  delete legacy.currency;
  assert.deepEqual(savedAgentChanges([legacy], [after], saved), []);
});

test('a followed agent that changes currency is emailed as a change of currency', async () => {
  const { agentChanges } = await import('../src/lib/notifications/agent-changes');
  const prev = { answering: true, priceU: 0.1, currency: MAINNET_U, delivered: 0, missed: 0 };
  const changes = agentChanges('Keel', prev, { ...prev, currency: MAINNET_USDT });
  assert.deepEqual(changes.map((c) => c.kind), ['price']);
  assert.match(changes[0].body, /currency changed from \$U to USDT/);
});

test('the public price keeps amountU only for $U, and names the token exactly', async () => {
  const { wirePrice } = await import('../src/lib/find/price');
  const usdt = wirePrice({ priceU: 0.5, priceRaw: '500000000000000000', currency: MAINNET_USDT });
  assert.equal(usdt.amountU, null);
  assert.equal(usdt.amount, '0.5');
  assert.equal(usdt.symbol, 'USDT');
  assert.equal(usdt.decimals, 18);
  assert.equal(usdt.settlementChainId, 56);
  const u = wirePrice({ priceU: 0.1, priceRaw: '100000000000000000', currency: MAINNET_U });
  assert.equal(u.amountU, 0.1);
  assert.equal(u.symbol, '$U');
  const unknown = wirePrice({ priceU: 1, priceRaw: '1', currency: UNKNOWN });
  assert.deepEqual([unknown.amountU, unknown.amount, unknown.symbol, unknown.decimals], [null, null, null, null]);
});

test('an unpayable price names its token', async () => {
  const { unpayablePriceNote } = await import('../src/lib/erc8183/payable');
  assert.match(unpayablePriceNote(MAINNET_USDT, true), /in USDT on BNB Chain/);
  assert.match(unpayablePriceNote(MAINNET_U, true), /in mainnet \$U/);
  assert.match(unpayablePriceNote(UNKNOWN, true), /a token Pokter has not verified/);
});
