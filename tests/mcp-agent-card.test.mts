import assert from 'node:assert/strict';
import test from 'node:test';

import { AGENT_CARD_HTML } from '../src/lib/mcp/agent-card-html';
import { buildAgentCard } from '../src/lib/mcp/agent-card';

// Touchstone's public record on 15 October, trimmed.
const TOUCHSTONE = {
  name: 'Touchstone', chainId: 56, tokenId: '374115',
  ladder: { label: 'Delivered', steps: [{ label: 'Answers', earned: true }, { label: 'Priced', earned: true }, { label: 'Delivered', earned: true }, { label: 'Checked', earned: false }] },
  price: { amountU: 0.05, current: true, payable: true },
  hire: { escrowChainId: 56 },
  hireBlocker: null,
  links: { html: 'https://pokter.xyz/agents/56/374115' },
};

test('the card carries the step, price, network and a hire link with the brief', () => {
  const card = buildAgentCard(TOUCHSTONE, { origin: 'https://pokter.xyz', brief: 'Check CAKE', quote: { priceRaw: '50000000000000000', signer: '0x071044a5A92F6C90cf9D08D5059921da734D19e7', termsBound: true } });
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
