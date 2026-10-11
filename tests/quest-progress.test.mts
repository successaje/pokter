import assert from 'node:assert/strict';
import test from 'node:test';

import { marketplaceFromTask, summariseQuest, type QuestHire } from '../src/lib/quest/progress';

const hire = (over: Partial<QuestHire>): QuestHire => ({ chainId: 56, jobId: '1', provider: '0xaaa', agent: null, marketplace: null, status: 'FUNDED', ...over });

test('a marketplace is read only where the record names it', () => {
  assert.equal(marketplaceFromTask('Venus health factor for 0x54c0, via mandatemarkets.com'), 'mandatemarkets.com');
  assert.equal(marketplaceFromTask('Grid plan via Example.Trade'), 'example.trade');
  assert.equal(marketplaceFromTask('Compare yields across venues'), null);
});

test('different agents are counted by identity, or by paid wallet when unidentified', () => {
  const s = summariseQuest([
    hire({ agent: { chainId: 56, tokenId: '1', name: 'A' }, provider: '0x1' }),
    hire({ agent: { chainId: 56, tokenId: '1', name: 'A' }, provider: '0x1', jobId: '2' }),
    hire({ provider: '0x2' }),
    hire({ provider: '0x3' }),
  ]);
  assert.equal(s.hires, 4);
  assert.equal(s.distinctAgents, 3);
  assert.equal(s.agentsMet, true);
});

test('two named marketplaces meet the rule; one named plus unrecorded is only likely', () => {
  assert.equal(summariseQuest([hire({ marketplace: 'pokter.xyz' }), hire({ marketplace: 'example.com', provider: '0xb' })]).marketplaces, 'met');
  assert.equal(summariseQuest([hire({ marketplace: 'pokter.xyz' }), hire({ provider: '0xb' })]).marketplaces, 'likely');
  assert.equal(summariseQuest([hire({ marketplace: 'pokter.xyz' }), hire({ marketplace: 'pokter.xyz', provider: '0xb' })]).marketplaces, 'not-met');
  assert.equal(summariseQuest([]).marketplaces, 'not-met');
});
