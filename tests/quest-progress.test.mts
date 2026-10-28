import assert from 'node:assert/strict';
import test from 'node:test';

import { marketplaceFromRecord, marketplaceFromTask, summariseQuest, taskOf, type QuestHire } from '../src/lib/quest/progress';

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

test('a record names its marketplace in client_ref or in its task, and nothing else counts', () => {
  /* 56/57030 and 56/57037 carried this and were shown as "Not recorded". */
  const quote = (fields: Record<string, unknown>) => JSON.stringify({ chain_id: 56, task: 'Venus health factor for 0x0d8c', ...fields });
  assert.equal(marketplaceFromRecord(quote({ client_ref: 'marque.trade' })), 'marque.trade');
  assert.equal(marketplaceFromRecord(quote({ client_ref: 'https://Marque.Trade/hire/1' })), 'marque.trade');
  /* An order number is not a site. */
  assert.equal(marketplaceFromRecord(quote({ client_ref: 'order-8812' })), null);
  assert.equal(marketplaceFromRecord(quote({ client_ref: 42 })), null);
  /* The task still names it when client_ref does not. */
  assert.equal(marketplaceFromRecord(quote({ client_ref: 'order-8812', task: 'Grid plan (via marque.trade)' })), 'marque.trade');
  assert.equal(marketplaceFromRecord('via mandatemarkets.com: Mandate Guard-1 (ERC-8004 #344123)'), 'mandatemarkets.com');
  assert.equal(marketplaceFromRecord('Get the best possible position for me'), null);
  assert.equal(marketplaceFromRecord('[1,2]'), null);
  assert.equal(taskOf(quote({})), 'Venus health factor for 0x0d8c');
  assert.equal(taskOf(JSON.stringify({ task_description: 'Compare yields' })), 'Compare yields');
  assert.equal(taskOf('plain text'), 'plain text');
});
