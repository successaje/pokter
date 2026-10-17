import assert from 'node:assert/strict';
import test from 'node:test';

import { forgetBrief, recallBrief, rememberBrief } from '../src/lib/hire/brief-memory';
import { mainnetHireBlocked } from '../src/lib/hire/mainnet-blocked';

const agent = { chainId: 56, tokenId: '374112' };

test('a typed brief survives switching network, and is dropped once funded', () => {
  rememberBrief(agent, { task: 'Rank Venus supply markets for 1000 USDT', template: null, recipe: null, schema: '' });
  assert.equal(recallBrief(agent)?.task, 'Rank Venus supply markets for 1000 USDT');
  assert.equal(recallBrief({ chainId: 97, tokenId: '374112' }), null, 'kept per agent');
  forgetBrief(agent);
  assert.equal(recallBrief(agent), null);
});

test('clearing the text forgets the brief, but a chosen template is kept', () => {
  rememberBrief(agent, { task: '  ', template: null, recipe: null, schema: '' });
  assert.equal(recallBrief(agent), null);
  rememberBrief(agent, { task: '', template: 'grid', recipe: 'grid', schema: '{}' });
  assert.equal(recallBrief(agent)?.template, 'grid');
  forgetBrief(agent);
});

test('a known pricing failure blocks only a mainnet purchase', () => {
  assert.equal(mainnetHireBlocked({ escrow: { chainId: 56 }, hireBlocker: { transient: false } }), true);
  assert.equal(mainnetHireBlocked({ escrow: { chainId: 56 }, hireBlocker: { transient: true } }), false, 'one busy moment is not a verdict');
  assert.equal(mainnetHireBlocked({ escrow: { chainId: 97 }, hireBlocker: { transient: false } }), false, 'testnet is carried by Pokter');
  assert.equal(mainnetHireBlocked({ escrow: { chainId: 56 }, hireBlocker: null }), false);
});
