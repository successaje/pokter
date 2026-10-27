import assert from 'node:assert/strict';
import test from 'node:test';

import { QUOTE_FAILURE_CODES } from '../src/lib/hire/failure';
import { hireBlocker } from '../src/lib/hire/blocker';
import { NO_ENDPOINT_DETAIL } from '../src/lib/hire/no-endpoint';

test('every refusal code has owner-facing words and a kit section', () => {
  for (const code of QUOTE_FAILURE_CODES) {
    const blocker = hireBlocker({ code });
    assert.ok(blocker, code);
    assert.match(blocker!.fix.href, /^\/build\/integration#[a-z]+$/, code);
    assert.doesNotMatch(blocker!.reason, /undefined|null/, code);
  }
});

test('the cases seen on 15 October read as the owner needs them', () => {
  assert.match(hireBlocker({ code: 'bad-signature', agentWallet: '0x75a0c2d1df51c07982de3ff031e5232518676b19' })!.reason, /registered agent wallet \(0x75a0…6b19\)/);
  assert.match(hireBlocker({ code: 'no-endpoint', protocols: ['mcp'] })!.reason, /only an MCP endpoint/);
  assert.match(hireBlocker({ code: 'no-endpoint', detail: NO_ENDPOINT_DETAIL.cardWithoutJsonRpc, protocols: ['a2a'] })!.reason, /no HTTPS JSON-RPC interface/);
  assert.match(hireBlocker({ code: 'seller-declined', sellerReason: 'grid_plan needs `token`' })!.reason, /“grid_plan needs `token`”/);
  assert.equal(hireBlocker({ code: 'timeout' })!.transient, true);
  assert.equal(hireBlocker({ code: 'no-price-skill' })!.transient, false);
  assert.equal(hireBlocker({ code: 'something-new' }), null);
});
