import assert from 'node:assert/strict';
import test from 'node:test';

import { isFeaturableAgent } from '../src/lib/agents/eligibility';
import { brinkwatch } from '../src/lib/house/agents/brinkwatch';
import { houseRegistrationFile } from '../src/lib/house/registration-file';
import { HOUSE_AGENT_WALLETS, isHouseAgent } from '../src/lib/house/wallets';

const named = { name: 'Brinkwatch', description: 'Reads a wallet’s Venus position and reports how close it is to liquidation.' };

test('agents Pokter runs are recognised by owner or payout wallet, in any case', () => {
  assert.equal(isHouseAgent({ owner_address: HOUSE_AGENT_WALLETS.brinkwatch.toLowerCase() }), true);
  assert.equal(isHouseAgent({ agent_wallet: HOUSE_AGENT_WALLETS.touchstone }), true);
  assert.equal(isHouseAgent({ owner_address: '0x253F7Ad5D52099C4a2293418a661e9974DfB5e84' }), false);
});

test('a house agent is never featured; the same agent run by anyone else can be', () => {
  assert.equal(isFeaturableAgent({ ...named, owner_address: HOUSE_AGENT_WALLETS.brinkwatch }), false);
  assert.equal(isFeaturableAgent({ ...named, owner_address: '0x253F7Ad5D52099C4a2293418a661e9974DfB5e84' }), true);
});

test('the registration points each chain at its own card and names its maker', () => {
  const file = houseRegistrationFile(brinkwatch, 56, new URL('https://pokter.xyz')) as unknown as Record<string, unknown>;
  assert.deepEqual(file.services, [{ name: 'A2A', endpoint: 'https://pokter.xyz/house/brinkwatch/56/.well-known/agent-card.json' }]);
  assert.deepEqual(file.categories, ['health-factor']);
  assert.equal(file.built_with, 'Pokter Studio · https://pokter.xyz/studio');
  assert.equal(file.image, 'https://pokter.xyz/agents/brinkwatch.svg');
});

test('every house agent is classified from its description alone, as the registry index stores no tags', async () => {
  const { classify } = await import('../src/lib/agents/categories');
  const { HOUSE_AGENTS } = await import('../src/lib/house/registry');
  for (const agent of HOUSE_AGENTS) {
    assert.equal(classify({ name: agent.name, description: agent.description, tags: [] } as never), agent.category, agent.slug);
  }
});

test('every house agent has its own mark, named for it', async () => {
  const { existsSync, readFileSync } = await import('node:fs');
  for (const slug of ['brinkwatch', 'cresthold', 'centreline', 'gridloom', 'touchstone']) {
    const path = new URL(`../public/agents/${slug}.svg`, import.meta.url);
    assert.ok(existsSync(path), `${slug} has a mark`);
    const svg = readFileSync(path, 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 980 980"/);
    assert.match(svg, new RegExp(`aria-label="${slug[0].toUpperCase()}${slug.slice(1)} by Pokter"`));
  }
});
