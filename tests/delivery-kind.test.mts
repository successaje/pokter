import assert from 'node:assert/strict';
import test from 'node:test';

import { deliveryKind } from '../src/lib/agent/delivery-kind';

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
