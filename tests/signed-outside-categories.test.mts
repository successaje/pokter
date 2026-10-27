import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { a2aVersionUnsupported, jsonRpcEndpoint, jsonRpcInterface } from '../src/lib/a2a/card';
import { negotiationSkillOf } from '../src/lib/erc8183/courier-parse';

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('a signed agent outside the five categories is listed and counted, as unclassified and unevaluated', () => {
  const market = code('lib/marketplace.ts');
  assert.match(market, /\.quotedAgents\(\)\s*\.filter\(\(a\) => !listed\.has\(`\$\{a\.chainId\}:\$\{a\.tokenId\}`\)/);
  assert.match(market, /const extra = searchableFrom\(\(await signedAgentRows\(signedElsewhere\)\)\.filter\(\(agent\) => isPromotableAgent\(agent\)\)\);/, 'classified by the same rule as a name search, and only ones Pokter would promote');
  assert.match(market, /return \{ entries: \[\.\.\.entries, \.\.\.extra\], unreachable, incomplete \};/);
  assert.match(market, /const SIGNED_ROW_LIMIT = 60;/, 'bounded');
  const counts = code('lib/agents/catalogue-counts.ts');
  assert.match(counts, /pricedInCategories: distinctAgentCount\(priced\.filter\(\(entry\) => entry\.listing\.category !== 'unclassified'\)/);
  assert.match(code('app/(site)/page.tsx'), /label: 'Of those, in a category Pokter evaluates', value: home\.catalogue\.pricedInCategories/);
  /* Findable under a name that claims no evaluation, and never featured as if evaluated. */
  assert.match(code('features/discover/params.ts'), /category: cat === 'unclassified' \? 'unclassified'/);
  assert.match(code('features/discover/search.ts'), /\{ id: 'unclassified' as const, label: 'Unclassified', count: unclassified \}/);
  assert.match(code('features/home/data.ts'), /entry\.listing\.category !== 'unclassified'\)/);
});

test('an identity that says it is not a marketplace agent is not promoted', async () => {
  const { isPromotableAgent } = await import('../src/lib/agents/eligibility');
  assert.equal(isPromotableAgent({ name: 'hosted-erc8183-seller-fixture', description: 'Testing infrastructure for the browser-wallet ERC-8183 spike; not a marketplace agent.' }), false);
  assert.equal(isPromotableAgent({ name: 'Bound', description: 'PancakeSwap V3 range health and bounded re-centre planning.' }), true);
});

test('builder preflight judges the negotiate skill by id, as the requester does', () => {
  const skills = [{ id: 'negotiate', name: 'Negotiate price' }, { id: 'check', name: 'Check a token' }];
  assert.equal(negotiationSkillOf(skills), 'negotiate', 'the requester asks this card');
  assert.match(code('lib/proof/prober.ts'), /negotiationSkill: negotiationSkillOf\(skills\),/, 'and the probe reports the same, not the display name');
});

test('Pokter calls the A2A version it speaks where a card offers more than one, and names a 1.x-only card', () => {
  const card = {
    name: 'x',
    skills: [],
    supportedInterfaces: [
      { url: 'https://agent.example/v1', protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
      { url: 'https://agent.example/v03', protocolBinding: 'JSONRPC', protocolVersion: '0.3.0' },
    ],
  };
  assert.equal(jsonRpcEndpoint(card), 'https://agent.example/v03');
  const newOnly = { name: 'x', skills: [], supportedInterfaces: [{ url: 'https://agent.example/v1', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }] };
  assert.deepEqual(jsonRpcInterface(newOnly), { url: 'https://agent.example/v1', binding: 'JSONRPC', version: '1.0' }, 'still returned, with its version');
  for (const v of ['1.0', '1', 'v1.2', '2.0']) assert.equal(a2aVersionUnsupported(v), true, v);
  for (const v of ['0.3.0', '0.2', null, undefined, '']) assert.equal(a2aVersionUnsupported(v), false, String(v));
  assert.match(code('app/api/builders/preflight/route.ts'), /Pokter asks in A2A 0\.3 \(message\/send\) and does not yet speak the newer wire format/);
});
