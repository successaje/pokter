import assert from 'node:assert/strict';
import test from 'node:test';
import { parseService, serviceBrief, serviceMessage } from '../src/lib/services/model';

const content = { title: 'Risk report', description: 'Review positions and explain liquidation exposure.', buyerProvides: 'Wallet and risk limits', delivers: 'A written report with sources', category: 'health-factor', chainId: 97, tokenId: '2225', status: 'active' };

test('only scoped service offers are accepted', () => {
  assert.deepEqual(parseService(content), content);
  assert.equal(parseService({ ...content, tokenId: 'not-an-agent' }), null);
  assert.equal(parseService({ ...content, category: 'fake' }), null);
  assert.equal(parseService({ ...content, description: '<script>' }), null);
});

test('signed service terms bind builder, agent and full scope', () => {
  const wallet = '0x00000000000000000000000000000000000000bb';
  const parsed = parseService(content)!;
  const message = serviceMessage(wallet, '\nChallenge: one', null, parsed);
  assert.equal(message, serviceMessage(wallet, '\nChallenge: one', null, { ...parsed, title: `  ${parsed.title}  `, description: `${parsed.description}  ` }));
  assert.notEqual(message, serviceMessage(wallet, '\nChallenge: two', null, parsed));
  assert.notEqual(message, serviceMessage(wallet, '\nChallenge: one', null, { ...parsed, delivers: 'Different output' }));
  assert.match(serviceBrief(parsed, 'My wallet is 0x123'), /My wallet is 0x123/);
});
