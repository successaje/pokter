import assert from 'node:assert/strict';
import test from 'node:test';

import { toAgentSummary } from '../../src/lib/api/v1';
import { CATALOGUE_PER_CATEGORY } from '../../src/lib/agents/categories';
import { buildTrackRecord } from '../../src/lib/history/record';
import { SWEEP_PER_CATEGORY } from '../../src/lib/history/sweep';
import { AWAITING_AGENT_DETAIL } from '../../src/lib/proof/probe-target';

/*
 * A platform listing with no agent bound to it, as the public API carries
 * it, and the sweep's depth against the catalogue's. Server-only modules,
 * so run with the react-server condition. The catalogue card's verdict is
 * tested in tests/awaiting-agent-record.
 */

const listing = {
  agent: { chain_id: 56, token_id: '179824', name: 'Listing', description: '', total_feedbacks: 0, image_url: null, owner_address: '0x1', agent_wallet: '0x1', created_at: '2026-07-05T18:05:37Z' },
  category: 'content',
  confidence: 1,
  attestationCount: 0,
  quote: null,
  quotePayable: undefined,
};
const probes = Array.from({ length: 50 }, (_, i) => ({
  chainId: 56,
  tokenId: '179824',
  endpoint: 'https://listings.example/a2a/agents/179824/card',
  protocol: 'a2a',
  ok: false,
  latencyMs: 200,
  status: 200,
  detail: AWAITING_AGENT_DETAIL,
  probedAt: new Date(Date.now() - i * 3_600_000).toISOString(),
}));

test('the public API reports the state beside the probe counts', () => {
  const summary = toAgentSummary(listing as never, buildTrackRecord(probes), 'unknown' as never, 'https://pokter.xyz') as unknown as {
    probes: { value: { total: number; answered: number; awaitingAgent: boolean }; source: string };
    availability: { value: number | null };
  };
  assert.deepEqual({ total: summary.probes.value.total, awaitingAgent: summary.probes.value.awaitingAgent }, { total: 0, awaitingAgent: true });
  assert.equal(summary.availability.value, null);
  assert.match(summary.probes.source, /`awaitingAgent` is true and nothing is counted/);
});

test('the sweep measures as deep as the catalogue lists', () => {
  assert.equal(SWEEP_PER_CATEGORY, CATALOGUE_PER_CATEGORY);
});
