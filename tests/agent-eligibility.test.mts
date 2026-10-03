import assert from 'node:assert/strict';
import test from 'node:test';

import { isPromotableAgent } from '../src/lib/agents/eligibility';

test('ordinary production agents may be promoted', () => {
  assert.equal(
    isPromotableAgent({
      name: 'Treasury Sentinel',
      description: 'Monitors treasury positions and returns signed reports.',
    }),
    true,
  );
});

test('explicit test deployments stay out of recommendation surfaces', () => {
  assert.equal(
    isPromotableAgent({
      name: 'BNB Grid Trader (test)',
      description: 'TEST DEPLOYMENT — not for production use.',
    }),
    false,
  );
});

test('retired duplicates stay visible in the catalog but are not promoted', () => {
  assert.equal(
    isPromotableAgent({
      name: 'Yield Router',
      description: 'Retired duplicate of the current production identity.',
    }),
    false,
  );
});

test('publisher markers are matched case-insensitively', () => {
  assert.equal(
    isPromotableAgent({ name: 'Old agent', description: 'Not For Production' }),
    false,
  );
});

/*
 * "My Testnet Agent 02" was a live, hireable listing in a catalogue being
 * judged. Placeholder names are a draft left in public, not a service, so
 * they stay in the catalogue but out of every surface that recommends.
 */
test('placeholder names are not promotable', () => {
  for (const name of [
    'My Testnet Agent 02',
    'my testnet agent',
    'Agent',
    'Test Agent 7',
    'untitled',
    'New Agent #3',
    '   ',
  ]) {
    assert.equal(isPromotableAgent({ name }), false, name);
  }
});

test('a real name containing a placeholder word is still promotable', () => {
  for (const name of [
    'Liquidation Test Harness',
    'BNB LP Range Rebalancer',
    'Agent Advantage Monitor',
    'Treasury Reporter',
  ]) {
    assert.equal(isPromotableAgent({ name }), true, name);
  }
});

/*
 * Taking the publisher at their word. Both of these were live listings on
 * the marketplace, labelled by their own authors as not the real thing.
 */
test('a self-declared test or demo listing is not promoted', () => {
  for (const name of [
    'BNB Grid Trader (test)',
    'LingoAI Yield Optimiser (demo)',
    'Something (WIP)',
    'Thing (staging)',
  ]) {
    assert.equal(isPromotableAgent({ name }), false, name);
  }
});

test('a trailing parenthetical that qualifies rather than disclaims survives', () => {
  for (const name of [
    'Health Factor Monitor (Venus)',
    'Rebalancer (PancakeSwap V3)',
    'Yield Lens (BNB)',
  ]) {
    assert.equal(isPromotableAgent({ name }), true, name);
  }
});
