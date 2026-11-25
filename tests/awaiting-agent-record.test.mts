import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTrackRecord } from '../src/lib/history/record';
import { AWAITING_AGENT_DETAIL, isAwaitingAgentProbe } from '../src/lib/proof/probe-target';
import { endpointReading } from '../src/lib/compare/rows';
import { offersDirectHire, verdictFor } from '../src/lib/search/match';

/*
 * A probe that found a platform listing with no agent bound to it is a
 * reading of the address, not of an agent. On 25 November such listings
 * read "Failing" after hundreds of probes each.
 */

type Probe = Parameters<typeof buildTrackRecord>[0][number];
const NOW = new Date('2026-11-25T12:00:00Z');
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
const probe = (hoursAgo: number, kind: 'listing' | 'answered' | 'silent'): Probe => ({
  chainId: 56,
  tokenId: '179824',
  endpoint: 'https://listings.example/a2a/agents/179824/card',
  protocol: 'a2a',
  ok: kind === 'answered',
  latencyMs: kind === 'silent' ? null : 120,
  status: kind === 'silent' ? null : 200,
  detail: kind === 'listing' ? AWAITING_AGENT_DETAIL : kind === 'answered' ? 'ok' : 'timeout after 8000 ms',
  probedAt: at(hoursAgo),
});

test('only a failed probe carrying the listing detail is one', () => {
  assert.equal(isAwaitingAgentProbe(probe(1, 'listing')), true);
  assert.equal(isAwaitingAgentProbe(probe(1, 'silent')), false);
  assert.equal(isAwaitingAgentProbe({ ok: true, detail: AWAITING_AGENT_DETAIL }), false, 'an answer is an answer');
});

test('a listing with no agent is not measured, and says why', () => {
  const record = buildTrackRecord(Array.from({ length: 400 }, (_, i) => probe(i * 0.5, 'listing')), NOW);
  assert.equal(record.totalProbes, 0, 'not 400 failures');
  assert.equal(record.totalAnswered, 0);
  assert.equal(record.longestOutage, null);
  assert.equal(record.firstSeen, null);
  assert.equal(record.awaitingAgent, true);
  assert.ok(record.windows.every((w) => w.probes === 0 && w.ratio === null));
});

test('once an agent is bound, its readings are ordinary measurements', () => {
  const record = buildTrackRecord([probe(10, 'listing'), probe(9, 'listing'), probe(2, 'answered'), probe(1, 'silent')], NOW);
  assert.equal(record.awaitingAgent, false, 'the latest reading decides');
  assert.equal(record.totalProbes, 2);
  assert.equal(record.totalAnswered, 1);
  assert.equal(record.firstSeen, at(2));
});

test('an agent that is really silent is still counted as failing', () => {
  const record = buildTrackRecord([probe(3, 'silent'), probe(2, 'silent'), probe(1, 'silent')], NOW);
  assert.equal(record.totalProbes, 3);
  assert.equal(record.totalAnswered, 0);
  assert.equal(record.awaitingAgent, false);
});

test('the latest check says the address answered with a listing, not that it did not answer', () => {
  assert.equal(
    endpointReading(probe(1, 'listing')),
    'No agent connected yet: the address answers over A2A with a listing that has no agent bound to it',
  );
  assert.match(endpointReading(probe(1, 'silent')), /^Did not answer over A2A/);
});

test('the catalogue calls it not measured, not failing, and offers no hire', () => {
  const listing = { agent: { chain_id: 56, token_id: '179824', name: 'Listing' }, category: 'content', confidence: 1, attestationCount: 0, quote: null, quotePayable: undefined };
  const waiting = { listing: listing as never, record: buildTrackRecord(Array.from({ length: 50 }, (_, i) => probe(i, 'listing')), NOW) };
  assert.equal(verdictFor(waiting), 'unproven');
  assert.equal(offersDirectHire(waiting), false);
  const silent = { listing: listing as never, record: buildTrackRecord(Array.from({ length: 50 }, (_, i) => probe(i, 'silent')), NOW) };
  assert.equal(verdictFor(silent), 'failing', 'a silent agent is still failing');
});
