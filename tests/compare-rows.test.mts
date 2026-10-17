import assert from 'node:assert/strict';
import test from 'node:test';

import { ago, checkReading, custodyOf, declaredProtocols, endpointReading } from '../src/lib/compare/rows';

test('custody compares the agent wallet with the owner, and says unknown without one', () => {
  assert.equal(custodyOf('0xAbC', '0xabc').separate, false);
  assert.equal(custodyOf('0xAbC', '0xdef').separate, true);
  assert.equal(custodyOf(null, '0xdef').separate, null);
});

test('the endpoint row says what the last probe saw', () => {
  assert.equal(endpointReading({ ok: true, latencyMs: 168, protocol: 'a2a', detail: '' }), 'Answered in 168 ms over A2A');
  assert.equal(endpointReading({ ok: false, latencyMs: null, protocol: 'a2a', detail: 'timeout after 8000 ms. retried' }), 'Did not answer over A2A: timeout after 8000 ms');
  assert.equal(endpointReading(null), 'Not probed yet');
});

test('last checked is coarse and honest about never', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  assert.equal(ago('2026-10-17T11:00:00Z', now), '1 h ago');
  assert.equal(ago('2026-10-17T11:59:30Z', now), 'Just now');
  assert.equal(ago(null, now), 'Never');
});

test('a check scores only when it actually ran', () => {
  assert.deepEqual(checkReading({ passed: 2, total: 3, status: 'checked', via: 'paid-hire' }), { text: '2 of 3 passed (paid hire)', score: 2 / 3 });
  assert.equal(checkReading({ passed: 0, total: 0, status: 'paid-only', via: 'static' }).score, null);
  assert.equal(checkReading(null).text, 'Not checked yet');
});

test('protocols are the declared ones, deduplicated', () => {
  assert.deepEqual(declaredProtocols({ A2A: {}, mcp: {}, web: {} }, null), ['A2A', 'MCP', 'WEB']);
  assert.deepEqual(declaredProtocols(null, ['a2a']), ['A2A']);
});
