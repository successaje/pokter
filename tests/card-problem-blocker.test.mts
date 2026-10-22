import assert from 'node:assert/strict';
import test from 'node:test';

import { hireBlocker } from '../src/lib/hire/blocker';

/*
 * hwayongjin.agent (56:300282): never in the sweep's roster, so its page had
 * no blocker and offered a hire. The page's own card read now supplies one.
 */
test('a card that answers with nowhere to send a brief blocks the hire, permanently, in plain words', () => {
  const b = hireBlocker({ code: 'no-endpoint', detail: 'card-without-interface', protocols: ['a2a'] });
  assert.equal(b?.code, 'no-endpoint');
  assert.equal(b?.transient, false);
  assert.match(b?.reason ?? '', /names no service to send a brief to/);
  assert.match(b?.reason ?? '', /without connecting a running agent/);
});

test('the other no-endpoint cases keep their own words', () => {
  assert.match(hireBlocker({ code: 'no-endpoint', protocols: ['mcp'] })?.reason ?? '', /only an MCP endpoint/);
  assert.match(hireBlocker({ code: 'no-endpoint', protocols: ['a2a'] })?.reason ?? '', /no HTTPS JSON-RPC interface/);
  assert.match(hireBlocker({ code: 'no-price-skill' })?.reason ?? '', /no negotiate skill/);
});
