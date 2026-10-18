import assert from 'node:assert/strict';
import test from 'node:test';

import { agentJsonLd, type AgentJsonLdInput } from '../src/lib/seo/agent-jsonld';

const BASE = 'https://pokter.xyz';

const agent = (over: Partial<AgentJsonLdInput> = {}): AgentJsonLdInput => ({
  name: 'Brinkwatch',
  summary: 'Reads a wallet’s Venus Core Pool position and reports its health factor.',
  chainId: 56,
  tokenId: '374107',
  owner: '0xb72335e083a7eed9731d24c48dbf07c4ef1f051a',
  imageUrl: null,
  categoryLabel: 'Health Factor',
  record: { totalProbes: 54, totalAnswered: 52 },
  quote: { priceU: 0.1, currency: '0xcE24439F2D9C6a2289F741120FE202248B666666', expiresAt: null, payable: true },
  ...over,
});

test('an agent is a Service carrying its registry identity', () => {
  const ld = agentJsonLd(BASE, agent());
  assert.equal(ld['@type'], 'Service');
  assert.equal(ld.url, 'https://pokter.xyz/agents/56/374107');
  assert.equal(ld.identifier, 'erc8004:56:374107');
  assert.equal(ld.name, 'Brinkwatch');
});

test('a payable signed price becomes an Offer in its own token', () => {
  const ld = agentJsonLd(BASE, agent()) as { offers: Record<string, unknown> };
  assert.equal(ld.offers['@type'], 'Offer');
  assert.equal(ld.offers.price, 0.1);
  assert.equal(ld.offers.priceCurrency, 'U', 'the escrow token, not a fiat guess');
});

test('a price no escrow can settle is not published as an offer', () => {
  /*
   * The agent may well have signed it. Nothing here can be paid against
   * it, and saying "InStock" at a price would be a claim Pokter cannot
   * honour. `hireBlocker` is where that is explained.
   */
  const ld = agentJsonLd(BASE, agent({ quote: { priceU: 1, currency: '0x55d398326f99059ff775485246999027b3197955', expiresAt: null, payable: false } }));
  assert.equal(ld.offers, undefined);
});

test('an agent that has never signed a price has no offer', () => {
  assert.equal(agentJsonLd(BASE, agent({ quote: null })).offers, undefined);
});

test('an expired quote keeps its price and says when it lapsed', () => {
  const ld = agentJsonLd(BASE, agent({
    quote: { priceU: 0.1, currency: '0xcE24439F2D9C6a2289F741120FE202248B666666', expiresAt: '2026-10-17T22:26:43.000Z', payable: true },
  })) as { offers: Record<string, unknown> };
  assert.equal(ld.offers.price, 0.1, 'the signature was real; a hire re-asks');
  assert.equal(ld.offers.priceValidUntil, '2026-10-17');
});

test('probe replies are a named measurement, never a rating', () => {
  const ld = agentJsonLd(BASE, agent()) as { additionalProperty: Array<Record<string, unknown>> };
  assert.equal((ld as unknown as Record<string, unknown>).aggregateRating, undefined, 'probes are not stars');
  assert.equal((ld as unknown as Record<string, unknown>).review, undefined);
  const probes = ld.additionalProperty.find((p) => p.name === 'Probes answered');
  assert.equal(probes?.value, '52 of 54');
  assert.match(String(probes?.description), /Not a rating/);
});

test('an unprobed agent claims no probe record at all', () => {
  const ld = agentJsonLd(BASE, agent({ record: { totalProbes: 0, totalAnswered: 0 } })) as {
    additionalProperty: Array<Record<string, unknown>>;
  };
  assert.equal(ld.additionalProperty.find((p) => p.name === 'Probes answered'), undefined, 'missing is not zero');
  assert.ok(ld.additionalProperty.some((p) => p.name === 'Registry'), 'identity still stands');
});

test('the provider points at the owner wallet, not at Pokter', () => {
  const ld = agentJsonLd(BASE, agent()) as { provider: Record<string, unknown> };
  assert.equal(ld.provider.identifier, '0xb72335e083a7eed9731d24c48dbf07c4ef1f051a');
  assert.match(String(ld.provider.url), /\/builders\/0xb72335/);
});

test('a quote in an unrecognised token names it by address', () => {
  const ld = agentJsonLd(BASE, agent({
    quote: { priceU: 2, currency: '0x1234567890abcdef1234567890abcdef12345678', expiresAt: null, payable: true },
  })) as { offers: Record<string, unknown> };
  assert.match(String(ld.offers.priceCurrency), /^0x1234…5678$/, 'never a guessed symbol');
});
