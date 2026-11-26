import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTrackRecord } from '../src/lib/history/record';
import { AWAITING_AGENT_DETAIL, isAwaitingAgentProbe } from '../src/lib/proof/probe-target';
import { endpointReading } from '../src/lib/compare/rows';
import { offersDirectHire, verdictFor } from '../src/lib/search/match';

/*
 * A probe that found a platform listing with no agent bound to it is a
 * reading of the address, not of an agent. On 25 November such listings
 * read "Failing" after hundreds of probes each, and leaving out only those
 * probes still left every one of them failing on what else its history held.
 */

type Probe = Parameters<typeof buildTrackRecord>[0][number];
const NOW = new Date('2026-11-25T12:00:00Z');
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();
/*
 * `older` is the same listing as the prober recorded it before it learned to
 * recognise one, `loose` an early pass on any well-formed JSON, `invalid` a
 * reply that is neither an agent nor a listing.
 */
type Kind = 'listing' | 'answered' | 'silent' | 'server-error' | 'older' | 'loose' | 'invalid';
const DETAIL: Record<Kind, string> = {
  listing: AWAITING_AGENT_DETAIL,
  answered: 'ok',
  silent: 'No response within 10s.',
  'server-error': 'Endpoint answered 502 Bad Gateway.',
  older: 'Endpoint returned JSON, but not a valid A2A agent card.',
  loose: 'Endpoint served a well-formed JSON response.',
  invalid: 'Endpoint returned JSON, but not a valid A2A agent card.',
};
const probe = (hoursAgo: number, kind: Kind): Probe => ({
  chainId: 56,
  tokenId: '179824',
  endpoint: 'https://listings.example/a2a/agents/179824/card',
  protocol: 'a2a',
  ok: kind === 'answered' || kind === 'loose',
  latencyMs: kind === 'silent' ? null : 120,
  status: kind === 'silent' ? null : kind === 'server-error' ? 502 : 200,
  detail: DETAIL[kind],
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

test('while the latest reply is the listing, nothing in its history counts', () => {
  /* The shape production held on 26 November: early loose passes, the listing under older wording, timeouts, then the listing recognised. */
  const history = [
    ...Array.from({ length: 20 }, (_, i) => probe(900 - i, 'loose')),
    ...Array.from({ length: 30 }, (_, i) => probe(700 - i, 'older')),
    ...Array.from({ length: 10 }, (_, i) => probe(500 - i * 20, 'silent')),
    ...Array.from({ length: 40 }, (_, i) => probe(200 - i * 4, 'listing')),
  ];
  const record = buildTrackRecord(history, NOW);
  assert.equal(record.awaitingAgent, true);
  assert.equal(record.totalProbes, 0, 'not 60 failures and 20 passes of a listing');
  assert.equal(record.totalAnswered, 0);
  assert.deepEqual(record.days, []);
  assert.equal(record.longestOutage, null);
});

test('a timeout or a server error after the listing does not end it', () => {
  for (const kind of ['silent', 'server-error'] as const) {
    const record = buildTrackRecord([probe(9, 'silent'), probe(3, 'listing'), probe(2, 'listing'), probe(1, kind)], NOW);
    assert.equal(record.awaitingAgent, true, `${kind}: says nothing about whether an agent was bound`);
    assert.equal(record.totalProbes, 0);
  }
});

test('once the address answers as an agent, its probes count again, all but the listing replies', () => {
  const record = buildTrackRecord([probe(10, 'silent'), probe(9, 'listing'), probe(8, 'listing'), probe(2, 'answered'), probe(1, 'silent')], NOW);
  assert.equal(record.awaitingAgent, false, 'the latest reply decides');
  assert.equal(record.totalProbes, 3);
  assert.equal(record.totalAnswered, 1);
  assert.equal(record.firstSeen, at(10));
});

test('a reply that is neither an agent nor the listing is a failure', () => {
  const record = buildTrackRecord([probe(3, 'listing'), probe(2, 'listing'), probe(1, 'invalid')], NOW);
  assert.equal(record.awaitingAgent, false);
  assert.equal(record.totalProbes, 1);
  assert.equal(record.totalAnswered, 0);
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
    'No agent connected: the address answers over A2A with a listing that has no agent bound to it',
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
  const timedOut = { listing: listing as never, record: buildTrackRecord([...Array.from({ length: 40 }, (_, i) => probe(400 - i, 'older')), ...Array.from({ length: 40 }, (_, i) => probe(100 - i * 2, i % 8 === 0 ? 'silent' : 'listing'))], NOW) };
  assert.equal(verdictFor(timedOut), 'unproven', 'older failures and host timeouts do not make a listing failing');
  assert.equal(offersDirectHire(timedOut), false);
});
