import assert from 'node:assert/strict';
import test from 'node:test';

import { interpretTrialResponse, selectTrialCapability } from '../src/lib/builder/trial';

test('only explicit preview and dry-run capabilities can be exercised', () => {
  assert.equal(selectTrialCapability(['trade', 'withdraw', 'dry-run']), 'dry-run');
  assert.equal(selectTrialCapability(['rebalance', 'execute']), null);
});

test('a successful trial must return a JSON-RPC result', () => {
  assert.equal(interpretTrialResponse({ jsonrpc: '2.0', id: '1', result: { ok: true } }).valid, true);
  assert.equal(interpretTrialResponse({ result: { ok: true } }).valid, false);
  assert.equal(interpretTrialResponse({ jsonrpc: '2.0', error: { code: -1 } }).valid, false);
});
