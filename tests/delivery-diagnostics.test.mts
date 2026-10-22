import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deliveryDiagnosticLine, sanitiseFailureReason } from '../src/lib/erc8183/delivery-diagnostics';

test('a provider URL is reduced to its host', () => {
  /*
   * The ordinary way these are configured puts the key in the path or the
   * query, so the path is the part that must not survive. The host is what
   * makes the error readable at all.
   */
  assert.equal(
    sanitiseFailureReason('HTTP request failed: https://bsc-testnet.infura.io/v3/abc123secretkey timed out'),
    'HTTP request failed: [bsc-testnet.infura.io] timed out',
  );
  assert.equal(
    sanitiseFailureReason('post to http://relay.internal:8545/rpc?apikey=zzz refused'),
    'post to [relay.internal:8545] refused',
  );
});

test('a labelled secret is reduced to its label', () => {
  /*
   * The match runs to the next whitespace, so adjacent punctuation goes with
   * the secret — `(apiKey: sk_live_41d9f)` loses its closing bracket. That is
   * the deliberate direction: a reason that reads slightly oddly costs
   * nothing, and a secret that survives because the pattern stopped politely
   * at a bracket costs everything.
   */
  assert.equal(sanitiseFailureReason('auth failed (apiKey: sk_live_41d9f)'), 'auth failed (apiKey=[redacted]');
  assert.equal(sanitiseFailureReason('token=eyJhbGciOiJIUzI1NiJ9 rejected'), 'token=[redacted] rejected');
  assert.equal(sanitiseFailureReason('private_key = 0xdeadbeef'), 'private_key=[redacted]');
});

test('a bare 64-character hex run is removed', () => {
  // The shape of a private key without `0x`. Nothing legitimate in an RPC
  // error looks like it.
  const keyShaped = 'a'.repeat(64);
  assert.equal(sanitiseFailureReason(`signer rejected ${keyShaped}`), 'signer rejected [redacted]');
});

test('a transaction hash survives, because it is the thing worth having', () => {
  /*
   * Public, and the only handle an operator has on what actually happened.
   * Redacting it would defeat the purpose of logging at all.
   */
  const hash = `0x${'1'.repeat(64)}`;
  assert.equal(sanitiseFailureReason(`reverted in ${hash}`), `reverted in ${hash}`);
  const address = '0x93847647d7eb72a69E162117df6a8697dF53EDda';
  assert.equal(sanitiseFailureReason(`provider ${address} not allowed`), `provider ${address} not allowed`);
});

test('a reason is bounded and flattened', () => {
  const stack = `boom${'\n  at somewhere'.repeat(40)}`;
  const out = sanitiseFailureReason(stack);
  assert.ok(out.length <= 201, `bounded, got ${out.length}`);
  assert.ok(!out.includes('\n'), 'one line, so one log entry');
  assert.equal(sanitiseFailureReason(undefined), '');
  assert.equal(sanitiseFailureReason(new Error('plain')), 'plain');
});

test('the line carries chain, job, phase, action, reason and run time', () => {
  assert.equal(
    deliveryDiagnosticLine({ chainId: 97, jobId: '1585', phase: 'submit', action: 'failed', reason: new Error('execution reverted'), at: '2026-10-22T04:30:00.000Z' }),
    '[delivery-retry] chain=97 job=1585 phase=submit action=failed reason="execution reverted" at=2026-10-22T04:30:00.000Z',
  );
  // A skip has a reason too, and a delivery needs none.
  assert.match(deliveryDiagnosticLine({ chainId: 97, jobId: '1572', phase: 'eligibility', action: 'skipped', reason: 'expired — reclaimable by the buyer', at: 'T' }), /action=skipped reason="expired/);
  assert.equal(
    deliveryDiagnosticLine({ chainId: 97, jobId: '1585', phase: 'submit', action: 'delivered', at: 'T' }),
    '[delivery-retry] chain=97 job=1585 phase=submit action=delivered at=T',
  );
});
