import assert from 'node:assert/strict';
import test from 'node:test';

import { AGENT_CARD_HTML } from '../src/lib/mcp/agent-card-html';
import { buildAgentCard, networkOf } from '../src/lib/mcp/agent-card';

// Touchstone's public record on 15 October, trimmed.
const TOUCHSTONE = {
  name: 'Touchstone', chainId: 56, tokenId: '374115',
  ladder: { label: 'Delivered', steps: [{ label: 'Answers', earned: true }, { label: 'Priced', earned: true }, { label: 'Delivered', earned: true }, { label: 'Checked', earned: false }] },
  price: { amountU: 0.05, priceRaw: '50000000000000000', currency: '0xcE24439F2D9C6a2289F741120FE202248B666666', current: true, payable: true },
  hire: { escrowChainId: 56 },
  hireBlocker: null,
  links: { html: 'https://pokter.xyz/agents/56/374115' },
};

test('the card carries the step, price, network and a hire link with the brief', () => {
  const card = buildAgentCard(TOUCHSTONE, { origin: 'https://pokter.xyz', brief: 'Check CAKE', quote: { priceRaw: '50000000000000000', currency: '0xcE24439F2D9C6a2289F741120FE202248B666666', signer: '0x071044a5A92F6C90cf9D08D5059921da734D19e7', termsBound: true } });
  assert.equal(card.step, 'Delivered');
  assert.deepEqual(card.network, { label: 'BNB Chain · Mainnet', money: 'Real funds', real: true });
  assert.equal(card.quote?.price, '0.05 $U');
  assert.equal(card.quote?.signer, '0x0710…19e7');
  assert.equal(card.hireUrl, 'https://pokter.xyz/hire/56/374115?task=Check+CAKE');
  assert.equal(card.blocker, null);
});

test('a blocked agent’s card says why, and a testnet one says test tokens', () => {
  const card = buildAgentCard({ ...TOUCHSTONE, price: null, hire: { escrowChainId: 97 }, hireBlocker: { reason: 'Its agent card declares no negotiate skill.', fix: 'https://pokter.xyz/build/integration#skills' } }, { origin: 'https://pokter.xyz' });
  assert.equal(card.price, null);
  assert.equal(card.network?.money, 'Test tokens');
  assert.match(card.blocker?.reason ?? '', /no negotiate skill/);
});

test('the view is self-contained and draws text, never markup', () => {
  assert.doesNotMatch(AGENT_CARD_HTML, /<(img|link|iframe)\b|src="http|innerHTML/i);
  assert.match(AGENT_CARD_HTML, /ui\/initialize/);
  assert.match(AGENT_CARD_HTML, /ui\/notifications\/initialized/);
  assert.match(AGENT_CARD_HTML, /ui\/open-link/);
});

test('a card beside a fresh quote calls that price current, in its own amount', () => {
  // The stored price is older and usually expired; the quote just fetched is the price that holds.
  const card = buildAgentCard(
    { name: 'Touchstone', chainId: 56, tokenId: '374115', price: { amountU: 0.05, current: false }, hire: { escrowChainId: 56 } },
    { origin: 'https://pokter.xyz', quote: { priceRaw: '70000000000000000', currency: '0xcE24439F2D9C6a2289F741120FE202248B666666', signer: '0x071044a5A92F6C90cf9D08D5059921da734D19e7', termsBound: true } },
  );
  assert.deepEqual(card.price, { label: '0.07 $U', signed: true, current: true });
  assert.equal(card.quote?.price, '0.07 $U');
  // Without a quote, the stored price speaks for itself.
  const stored = buildAgentCard({ chainId: 56, tokenId: '1', price: { amountU: 0.05, current: false }, hire: { escrowChainId: 56 } }, { origin: 'https://pokter.xyz' });
  assert.equal(stored.price?.current, false);
});

test('the network says whether the money is real', () => {
  assert.deepEqual(networkOf(56), { chainId: 56, label: 'BNB Chain · Mainnet', money: 'Real funds', real: true });
  assert.equal(networkOf(97)?.real, false);
  assert.equal(networkOf(null), null);
});

test('a quote that does not name its money is not called $U', () => {
  /*
   * What the two fixtures above were quietly relying on. The card used to
   * print `formatUnits(raw, 18)` beside a literal `$U` whatever the quote
   * said, and `termsOf` in the MCP route took the currency as an argument
   * and discarded it. One agent in the catalogue signs prices in BNB Chain
   * USDT, so that was a real price reported in money it was not in.
   *
   * An amount with no stated currency now reports the raw units and names no
   * token, because a number with the wrong symbol is worse than a number
   * with no symbol.
   */
  const card = buildAgentCard(
    { name: 'Touchstone', chainId: 56, tokenId: '374115', price: null, hire: { escrowChainId: 56 } },
    { origin: 'https://pokter.xyz', quote: { priceRaw: '50000000000000000', signer: '0x0710', termsBound: true } },
  );
  assert.doesNotMatch(card.quote?.price ?? '', /\$U|USDT|USDC/, 'names no money it cannot verify');
  assert.match(card.quote?.price ?? '', /unverified token/);
});

test('a quote in a token Pokter has not verified is not relabelled', () => {
  // The inverse failure: a real currency Pokter does not recognise must not
  // be presented as the chain's default.
  const card = buildAgentCard(
    { name: 'Someone', chainId: 56, tokenId: '1', price: null, hire: { escrowChainId: 56 } },
    { origin: 'https://pokter.xyz', quote: { priceRaw: '1000000', currency: '0x000000000000000000000000000000000000dEaD', signer: '0x0710', termsBound: true } },
  );
  assert.doesNotMatch(card.quote?.price ?? '', /\$U/);
});

/*
 * Most of the catalogue is registered on one network and paid on another,
 * so a quote is read on the chain its currency belongs to. Read on the
 * registration chain, these printed "(unverified token)" for real prices.
 */
test('a quote is formatted on the chain its currency settles on, not the agent’s registration chain', async () => {
  const { formatQuoted, settlementChainOf } = await import('../src/lib/network/tokens');
  const MAINNET_U = '0xcE24439F2D9C6a2289F741120FE202248B666666';
  const TESTNET_U = '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565';
  const signer = '0x071044a5A92F6C90cf9D08D5059921da734D19e7';

  // Registered on testnet, quoting mainnet $U.
  const testnetAgent = { ...TOUCHSTONE, chainId: 97, hire: { escrowChainId: 56 } };
  const a = buildAgentCard(testnetAgent, { origin: 'https://pokter.xyz', quote: { priceRaw: '50000000000000000', currency: MAINNET_U, signer, termsBound: true } });
  assert.equal(a.quote?.price, '0.05 $U');
  assert.equal(a.price?.label, '0.05 $U');

  // Registered on mainnet, quoting testnet $U.
  const b = buildAgentCard(TOUCHSTONE, { origin: 'https://pokter.xyz', quote: { priceRaw: '100000000000000000', currency: TESTNET_U, signer, termsBound: true } });
  assert.equal(b.quote?.price, '0.1 $U');

  // Same symbol, different tokens: each resolves to its own chain.
  assert.equal(settlementChainOf(MAINNET_U), 56);
  assert.equal(settlementChainOf(TESTNET_U.toLowerCase()), 97);
  assert.equal(formatQuoted(MAINNET_U, '1000000000000000000')?.chainId, 56);
  assert.equal(settlementChainOf('0x000000000000000000000000000000000000dEaD'), null);
  assert.equal(settlementChainOf('not an address'), null);
});

test('formatting a USDT-priced quote names it, and does not make USDT payable', async () => {
  const { formatQuoted, offeredTokens } = await import('../src/lib/network/tokens');
  assert.equal(formatQuoted('0x55d398326f99059fF775485246999027B3197955', '2000000000000000000')?.label, '2 USDT');
  assert.deepEqual(offeredTokens(56).map((t) => t.symbol), ['U']);
  assert.deepEqual(offeredTokens(97).map((t) => t.symbol), ['U']);
});
