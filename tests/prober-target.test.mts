import assert from 'node:assert/strict';
import test from 'node:test';

import { MCP_PROTOCOL_VERSION, probeTarget } from '../src/lib/proof/probe-target';
import type { ScanAgentDetail } from '../src/lib/scan/types';

/**
 * Which MCP revision Pokter speaks to an agent.
 *
 * The handshake sent one hardcoded revision to every MCP agent, and an
 * agent implementing an earlier one answers 400. HeyAnon's three agents
 * declare 2025-06-18 in their registry records and were recorded as "not
 * answering" for months of probes because Pokter insisted on 2026-07-28 —
 * a reachable, working agent marked dead by its own marketplace.
 */

const agent = (services: Record<string, unknown>): ScanAgentDetail =>
  ({ token_id: '43129', services } as unknown as ScanAgentDetail);

test('the revision the agent declares is the one used', () => {
  const t = probeTarget(agent({ mcp: { endpoint: 'https://example.com/mcp/venus', version: '2025-06-18' } }));
  assert.equal(t?.protocol, 'mcp');
  assert.equal(t?.endpoint, 'https://example.com/mcp/venus');
  assert.equal(t?.version, '2025-06-18');
});

test('no declared revision falls back, rather than refusing to probe', () => {
  const t = probeTarget(agent({ mcp: { endpoint: 'https://example.com/mcp' } }));
  assert.equal(t?.version, null, 'null means the caller substitutes the default');
  assert.match(MCP_PROTOCOL_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test('a nonsense version is ignored instead of being sent as a header', () => {
  // Registry text is operator-supplied; a header built from it unchecked is
  // a request shaped by somebody else.
  for (const bad of ['latest', '2026', 42, null, { v: 1 }, '2026-07-28\r\nX-Evil: 1']) {
    const t = probeTarget(agent({ mcp: { endpoint: 'https://example.com/mcp', version: bad } }));
    assert.equal(t?.version, null, `${String(bad)} should not become a header`);
  }
});

test('the endpoint template is still expanded, and A2A still wins', () => {
  const t = probeTarget(agent({
    a2a: { endpoint: 'https://example.com/a/{agentId}' },
    mcp: { endpoint: 'https://example.com/mcp', version: '2025-06-18' },
  }));
  assert.equal(t?.protocol, 'a2a', 'A2A is preferred when both are published');
  assert.equal(t?.endpoint, 'https://example.com/a/43129');
  assert.equal(t?.version, null, 'the A2A service declared none');
});

test('an unexpanded placeholder or a non-https endpoint is skipped', () => {
  assert.equal(probeTarget(agent({ mcp: { endpoint: 'https://example.com/{unknown}' } })), null);
  assert.equal(probeTarget(agent({ mcp: { endpoint: 'http://example.com/mcp' } })), null);
  assert.equal(probeTarget(agent({})), null);
});
