import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { carriesRelayedAnswerFor, deliveryKind, readDeliveredManifest } from '../src/lib/agent/delivery-kind';

test('a receipt from Pokter with no answer in it is a lifecycle demonstration', () => {
  // Job #1375, as served: an escrow receipt and a note that it demonstrates the lifecycle.
  const receipt = {
    title: 'Pokter verified execution receipt',
    result: { escrow_verified: true, job_id: 1375, chain_id: 97, status_at_acceptance: 'FUNDED' },
    limits: 'This demonstration proves the funded seller-notification, delivery and settlement lifecycle.',
  };
  assert.equal(deliveryKind('Pokter delivery agent (courier)', receipt), 'lifecycle');
});

test("the agent's own answer carried by Pokter's delivery agent is a relayed answer", () => {
  assert.equal(
    deliveryKind('Pokter delivery agent (courier)', { answer: { health_factor: 1.82 }, answered_by: { chain_id: 56, token_id: '269228' } }),
    'relayed',
  );
});

test('a file the agent or its builder delivered is its own', () => {
  // A builder's Studio delivery is hosted by Pokter but is the builder's work.
  assert.equal(deliveryKind('Pokter verified provider', { anything: 1 }), 'agent');
  assert.equal(deliveryKind('Keel', { anything: 1 }), 'agent');
  assert.equal(deliveryKind(null, null), 'agent');
});

/*
 * Job 97/1585's manifest, as `/api/seller/deliverables/1585` serves it.
 *
 * The real bytes, because this is the case the ladder got wrong: Pokter
 * Evidence answered the brief over A2A, the courier submitted the
 * manifest, the escrow completed, and the step read "a Pokter wallet
 * submitted it rather than the agent" — which says the buyer went
 * unserved. What distinguishes it is in these bytes and nowhere else.
 */
const manifest1585 = readFileSync('tests/fixtures/deliverable-1585.json', 'utf8');

test('job 1585’s manifest reads as the agent’s own answer, carried by Pokter', () => {
  const read = readDeliveredManifest(manifest1585);
  assert.equal(read?.kind, 'relayed');
  assert.equal(read?.answeredBy, '97:2599');
  assert.equal(carriesRelayedAnswerFor(read, { chainId: 97, tokenId: '2599' }), true);
});

test('a carried answer counts only for the agent the manifest names', () => {
  const read = readDeliveredManifest(manifest1585);
  // 97/2618 is the agent the report is *about*, not the one that wrote it.
  assert.equal(carriesRelayedAnswerFor(read, { chainId: 97, tokenId: '2618' }), false);
  assert.equal(carriesRelayedAnswerFor(read, { chainId: 56, tokenId: '2599' }), false);
});

test('a job with no recorded agent identity cannot claim a carried answer', () => {
  const read = readDeliveredManifest(manifest1585);
  assert.equal(carriesRelayedAnswerFor(read, { chainId: undefined, tokenId: '2599' }), false);
  assert.equal(carriesRelayedAnswerFor(read, { chainId: 97, tokenId: null }), false);
});

test('a lifecycle receipt is never a carried answer, however it is addressed', () => {
  const receipt = JSON.stringify({
    metadata: { producer: 'Pokter delivery agent (courier)', answered_by: '97:2599' },
    response: { content: JSON.stringify({ title: 'Pokter verified execution receipt', result: { escrow_verified: true } }) },
  });
  const read = readDeliveredManifest(receipt);
  assert.equal(read?.kind, 'lifecycle');
  assert.equal(carriesRelayedAnswerFor(read, { chainId: 97, tokenId: '2599' }), false);
});

test('an unreadable manifest is the absence of evidence, not a default', () => {
  assert.equal(readDeliveredManifest('not json'), null);
  assert.equal(carriesRelayedAnswerFor(null, { chainId: 97, tokenId: '2599' }), false);
});
