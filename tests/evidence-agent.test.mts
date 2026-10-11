import assert from 'node:assert/strict';
import test from 'node:test';

import { EVIDENCE_AGENT, evidenceCard, quoteTermsFor } from '../src/lib/evidence/agent';
import { parseAgentRef } from '../src/lib/evidence/refs';

const ORIGIN = new URL('https://pokter.xyz');

test('the quote spends the currency it is handed, and names its chain', () => {
  /*
   * Resolution lives at the request, where the chain is known, because
   * looking the token up here would import the SDK. What this pins is
   * that the terms cannot silently price in some other chain's token —
   * the defect Pokter found in thirteen other listings.
   */
  const mainnet = quoteTermsFor(56, '0xcE24439F2D9C6a2289F741120FE202248B666666');
  const testnet = quoteTermsFor(97, '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565');
  assert.equal(mainnet.chain_id, 56);
  assert.equal(testnet.chain_id, 97);
  assert.notEqual(mainnet.currency, testnet.currency);
  assert.equal(mainnet.price_u, testnet.price_u, 'the price is the same; only the token differs');
});

test('an agent reference is read in the forms other marketplaces use', () => {
  assert.deepEqual(parseAgentRef('56/303779', 56), { chainId: 56, tokenId: '303779' });
  assert.deepEqual(parseAgentRef('eip155:97:2554', 56), { chainId: 97, tokenId: '2554' });
  assert.deepEqual(parseAgentRef(' 97 : 2554 ', 56), { chainId: 97, tokenId: '2554' });
  assert.deepEqual(parseAgentRef('#303779', 56), { chainId: 56, tokenId: '303779' });
});

test('an unlisted chain is refused rather than silently retargeted', () => {
  assert.equal(parseAgentRef('1/303779', 56), null, 'ethereum is not indexed');
  assert.equal(parseAgentRef('not an agent', 56), null);
  assert.equal(parseAgentRef('', 56), null);
});

test('the card says what it does not do', () => {
  const card = evidenceCard(ORIGIN);
  assert.equal(card.metadata.ranks_agents, false, 'ranking competitors inside their own catalogue is the conflict');
  assert.match(
    card.metadata.measures,
    /not correctness/i,
    'availability is not a claim about whether the work is right',
  );
  assert.equal(card.provider.organization, 'Pokter', 'whose agent this is, stated');
});

test('the card advertises a reachable endpoint, never localhost', () => {
  const card = evidenceCard(ORIGIN);
  assert.ok(card.url.startsWith('https://'), 'a prober cannot reach http on another host');
  assert.doesNotMatch(card.url, /localhost|127\.0\.0\.1/);
  assert.ok(card.skills.some((s) => s.id === EVIDENCE_AGENT.skillId));
});
