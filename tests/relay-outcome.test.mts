import assert from 'node:assert/strict';
import test from 'node:test';

import { isPaidOnlyReason, latestRelayOutcome } from '../src/lib/erc8183/relay-outcome';

const refusal = { status: 'unreachable', reason: 'Asked directly, the agent offers only its escrow skills: it does this work only when paid through escrow.' };

test('the courier’s paid-only answers are recognised, other failures are not', () => {
  assert.equal(isPaidOnlyReason(refusal.reason), true);
  assert.equal(isPaidOnlyReason('Asked directly, the agent gives a priced preview: it does this work only when paid through escrow.'), true);
  assert.equal(isPaidOnlyReason('The agent answered 502 Bad Gateway.'), false);
  assert.equal(isPaidOnlyReason(null), false);
});

test('a relayed job answered with a price marks the agent as refusing the relay', () => {
  assert.equal(latestRelayOutcome([{ hiredAt: '2026-10-20T16:47:00Z', status: 'FUNDED', notice: refusal }]), 'refused');
});

test('a later delivery clears an earlier refusal, and a later refusal wins over an older delivery', () => {
  const delivered = { hiredAt: '2026-10-21T09:00:00Z', status: 'COMPLETED', notice: null };
  const refused = { hiredAt: '2026-10-20T16:47:00Z', status: 'EXPIRED', notice: refusal };
  assert.equal(latestRelayOutcome([refused, delivered]), 'delivered');
  assert.equal(latestRelayOutcome([{ ...delivered, hiredAt: '2026-10-19T09:00:00Z' }, refused]), 'refused');
});

test('a transient failure or no notice at all says nothing', () => {
  assert.equal(latestRelayOutcome([{ hiredAt: '2026-10-20T16:47:00Z', status: 'FUNDED', notice: { status: 'unreachable', reason: 'timeout' } }]), 'unknown');
  assert.equal(latestRelayOutcome([{ hiredAt: '2026-10-20T16:47:00Z', status: 'FUNDED', notice: null }]), 'unknown');
  assert.equal(latestRelayOutcome([]), 'unknown');
});
