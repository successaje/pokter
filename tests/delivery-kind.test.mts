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

/*
 * The courier's own producer string, pinned against the pattern that reads
 * it.
 *
 * Withholding delivery credit now rests on this match rather than on the
 * courier's wallet appearing in `TEAM_WALLETS`, so a rename in either
 * place would quietly hand agents credit for Pokter's deliveries — the
 * failure the address list already had. Read from source rather than
 * copied, so the two cannot drift apart without this failing.
 */
const producerIn = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8').match(/producer: '([^']+)'/)?.[1] ?? null;

test('the courier’s producer string is one `deliveryKind` recognises', () => {
  const courier = producerIn('lib/erc8183/demo-seller.ts');
  assert.equal(courier, 'Pokter delivery agent (courier)', 'the courier still names itself as the ladder expects');
  assert.equal(deliveryKind(courier, { answer: {}, answered_by: {} }), 'relayed');
  assert.equal(deliveryKind(courier, { escrow_verified: true }), 'lifecycle');
});

test('a delivery Pokter merely hosts is still the builder’s own work', () => {
  // Studio and the house engine deliver from the builder's own wallet.
  assert.equal(producerIn('app/api/builders/deliveries/route.ts'), 'Pokter verified provider');
  assert.equal(deliveryKind('Pokter verified provider', { answer: {}, answered_by: {} }), 'agent');
  // The evidence agent submits its own work from its own wallet.
  assert.equal(producerIn('lib/evidence/deliver.ts'), 'Pokter Evidence');
  assert.equal(deliveryKind('Pokter Evidence', { answer: {}, answered_by: {} }), 'agent');
});

test('valid JSON that is not a manifest is the absence of evidence, not a crash', () => {
  /*
   * `readDeliverable` returns whatever was stored, and the `try` only ever
   * covered text that would not parse. `null` parses perfectly and then
   * threw on the first property read — a crash in the path every agent page
   * and API reads its record through, rather than the "nothing on file"
   * each caller is written to expect.
   */
  for (const stored of ['null', '[]', '[{"metadata":{}}]', '5', '"a string"', 'true', '""']) {
    assert.equal(readDeliveredManifest(stored), null, stored);
  }
  // Still null for text that is not JSON at all.
  for (const stored of ['', '{', 'undefined', '<html>']) {
    assert.equal(readDeliveredManifest(stored), null, JSON.stringify(stored));
  }
});

test('a manifest whose fields are the wrong type reads as far as it safely can', () => {
  /*
   * `metadata` and `response` are read off an object that parsed, so a
   * string or a number there yields `undefined` rather than throwing — but
   * only a `typeof` check makes the value usable, and a half-read manifest
   * must not be classified as if it were whole.
   */
  assert.deepEqual(readDeliveredManifest('{"metadata":"nope","response":42}'), {
    kind: 'agent',
    answeredBy: null,
  });
  assert.deepEqual(
    readDeliveredManifest(JSON.stringify({ metadata: { producer: 42, answered_by: ['97', '2599'] }, response: { content: null } })),
    { kind: 'agent', answeredBy: null },
  );
});
