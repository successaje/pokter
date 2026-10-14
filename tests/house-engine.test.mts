import assert from 'node:assert/strict';
import test from 'node:test';

import { keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { encodePokterJobEnvelope } from '../src/lib/erc8183/job-envelope';
import { canonicalJson, negotiationContent, negotiationTermsBound, verifyNegotiationSignature } from '../src/lib/erc8183/negotiation';
import { houseCard } from '../src/lib/house/card';
import { signHouseQuote } from '../src/lib/house/quote';
import { slugEnvName, type HouseAgentDefinition } from '../src/lib/house/types';
import { submitWindowProblem } from '../src/lib/house/window';

const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const account = privateKeyToAccount(KEY);
const COMMERCE = '0xea4daa3100a767e86fded867729ae7446476eba6';
const U = '0xcE24439F2D9C6a2289F741120FE202248B666666';

const agent: HouseAgentDefinition = {
  slug: 'test-agent',
  name: 'Test Agent',
  version: '1.0.0',
  category: 'yield',
  description: 'A test agent.',
  priceU: 0.05,
  skill: { id: 'test_skill', name: 'Test', description: 'Tests.', examples: ['Where should 1000 USDT earn the most?'], tags: ['test'] },
  deliverables: 'A test answer.',
  qualityStandards: 'Sourced.',
  check: (brief) => (/\d/.test(brief) ? null : { error: 'The brief names no amount', need: 'Say how much, e.g. 1000 USDT' }),
  run: async () => ({ ok: true, content: { answer: 1 } }),
};

test('a house quote passes Pokter’s signature and terms checks, brackets included', async () => {
  const task = 'Where should 1000 USDT [idle] earn the most?';
  const quote = await signHouseQuote({ definition: agent, account, chainId: 56, paymentToken: U, verifyingContract: COMMERCE, task, now: Date.parse('2026-10-15T00:00:00Z') });
  const envelope = quote as unknown as Record<string, unknown>;
  assert.equal(negotiationTermsBound(envelope, task), true);
  const signer = await verifyNegotiationSignature({ negotiationHash: quote.negotiation_hash, providerSignature: quote.provider_sig, expectedProvider: account.address });
  assert.ok(signer);
  assert.equal(quote.response.terms.price, '50000000000000000');
});

test('a job written from a house quote passes a strict seller’s hash check', async () => {
  // Sluicegate's rule: hash every description field except hash and signature.
  const task = 'Where should 1000 USDT earn the most?';
  const quote = await signHouseQuote({ definition: agent, account, chainId: 56, paymentToken: U, verifyingContract: COMMERCE, task });
  const content = negotiationContent(quote as unknown as Record<string, unknown>, task)!;
  const anchor = { ...content, negotiation_hash: quote.negotiation_hash, provider_sig: quote.provider_sig };
  const description = JSON.parse(encodePokterJobEnvelope({
    identityChainId: 56, agentTokenId: '1', category: 'yield', provider: account.address, task,
    quote: { negotiationHash: quote.negotiation_hash, providerSignature: quote.provider_sig, anchor },
  })) as Record<string, unknown>;
  const rest = Object.fromEntries(Object.entries(description).filter(([k]) => k !== 'negotiation_hash' && k !== 'provider_sig'));
  assert.equal(keccak256(toBytes(canonicalJson(rest))), description.negotiation_hash);
});

test('the card names the skills Pokter and reference sellers look for, with examples and the maker', () => {
  const card = houseCard(agent, new URL('https://pokter.xyz'), 56);
  assert.deepEqual(card.skills.map((s) => s.id), ['negotiate', 'notify_funded', 'test_skill']);
  assert.deepEqual(card.skills[2].examples, agent.skill.examples);
  assert.equal(card.url, 'https://pokter.xyz/api/house/test-agent/a2a?chain=56');
  assert.equal(card.metadata.built_with, 'Pokter Studio · https://pokter.xyz/studio');
  assert.equal(card.metadata.settles_on, 56);
});

test('delivery is refused when the review window no longer fits before the deadline', () => {
  const now = 1_800_000_000;
  const week = 604_800;
  assert.equal(submitWindowProblem({ expiredAt: now + week + 86_400, now, disputeWindowSeconds: week }), null);
  assert.match(submitWindowProblem({ expiredAt: now + week - 60, now, disputeWindowSeconds: week }) ?? '', /review window of 7 days/);
  assert.match(submitWindowProblem({ expiredAt: now + 600, now, disputeWindowSeconds: 900 }) ?? '', /15 minutes/);
});

test('each agent reads its own secret', () => {
  assert.equal(slugEnvName('brinkwatch'), 'HOUSE_AGENT_BRINKWATCH_KEY');
  assert.equal(slugEnvName('token-safety'), 'HOUSE_AGENT_TOKEN_SAFETY_KEY');
});
