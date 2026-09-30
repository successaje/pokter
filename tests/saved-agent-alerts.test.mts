import assert from 'node:assert/strict';
import test from 'node:test';

import { savedAgentChanges } from '../src/lib/wallet/saved-agents.js';

const saved = [{ chainId: 56, tokenId: '1', name: 'Keel', imageUrl: null, category: 'yield', description: 'Agent', savedAt: '2026-01-01T00:00:00Z' }];
const baseline = [{ chainId: 56, tokenId: '1', evidence: 'observed', response: 'responding' as const, priceU: null, checkedAt: '2026-01-01T00:00:00Z' }];

test('the first saved-agent observation establishes a baseline without noise', () => {
  assert.deepEqual(savedAgentChanges([], baseline, saved), []);
});

test('saved-agent alerts report only changed decision facts', () => {
  const next = [{ ...baseline[0], evidence: 'emerging', response: 'not-responding' as const, priceU: 0.1, checkedAt: '2026-01-02T00:00:00Z' }];
  const alerts = savedAgentChanges(baseline, next, saved);
  assert.deepEqual(alerts.map((alert) => alert.kind), ['evidence', 'response', 'price']);
  assert.match(alerts[2].body, /no current signed price → 0\.10 \$U/);
});
