import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deliveryDiagnosticLine, sanitiseFailureReason } from '../src/lib/erc8183/delivery-diagnostics';

test('a URL is parsed and reduced to its hostname', () => {
  // Parsed, not pattern-matched: a regex that "keeps the host" is a regex
  // deciding where a host ends, and it only has to be wrong once.
  assert.equal(
    sanitiseFailureReason('failed: https://bsc-testnet.infura.io/v3/abc123secretkey timed out'),
    'failed: [bsc-testnet.infura.io] timed out',
  );
  assert.equal(sanitiseFailureReason('post to http://relay.internal:8545/rpc?apikey=zzz'), 'post to [relay.internal]');
  assert.equal(sanitiseFailureReason('wss://node.example.com/ws/KEY dropped'), '[node.example.com] dropped');
});

test('an unparseable URL fails closed', () => {
  /*
   * A malformed IPv6 host matches the pattern and throws in `URL`, so the
   * whole token is dropped rather than guessed at.
   *
   * The limit, stated: the pattern ends at whitespace, because a URL does
   * not contain spaces. A contrived string like `https://[not a host]/v3/k`
   * therefore leaves its tail behind — a space inside a URL means it was
   * never one token, and the tail is prose rather than a credential.
   */
  assert.equal(sanitiseFailureReason('tried http://[::1/v3/secretkey'), 'tried [url]');
  assert.equal(sanitiseFailureReason('connect http://%zz%zz/path failed'), 'connect [url] failed');
});

test('a bearer token is removed entirely, not just its first word', () => {
  assert.equal(sanitiseFailureReason('401 from upstream: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig'), '401 from upstream: Bearer [redacted]');
  assert.equal(sanitiseFailureReason('authorization header bearer abc.def.ghi rejected'), 'authorization header Bearer [redacted] rejected');
});

test('a labelled secret loses everything after the label', () => {
  /*
   * To end of line, not to the next space: a mnemonic or a PEM block does
   * not stop at a space, and a rule that does would leak all but the first
   * word of one.
   */
  assert.equal(sanitiseFailureReason('auth failed apiKey: sk_live_41d9f more text here'), 'auth failed apiKey=[redacted]');
  assert.equal(sanitiseFailureReason('mnemonic = abandon abandon abandon ability'), 'mnemonic=[redacted]');
  assert.equal(sanitiseFailureReason('private_key=0xdeadbeef and the rest'), 'private_key=[redacted]');
});

test('a bare mnemonic is removed by its shape', () => {
  /*
   * Twelve short lowercase words with no label. This will sometimes catch
   * ordinary prose of exactly that shape, which is the direction to be wrong
   * in — a redacted sentence costs a minute, a leaked phrase costs the keys.
   */
  const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
  assert.equal(phrase.split(' ').length, 12);
  /*
   * Adjacent prose goes with it: `signer rejected` are themselves short
   * lowercase words, so they join the run and the whole thing is replaced.
   * That is the fail-closed direction — trimming the run back to exactly
   * twelve words would mean deciding which end the phrase starts at, and
   * that decision is what leaked in the previous version.
   */
  assert.equal(sanitiseFailureReason(`signer rejected ${phrase}`), '[redacted]');

  const twentyFour = `${phrase} ${phrase}`;
  assert.equal(sanitiseFailureReason(twentyFour), '[redacted]');

  // Eleven words is not a BIP-39 length, so prose of that size survives.
  const eleven = 'the transaction was rejected because the account cannot pay for gas';
  assert.equal(eleven.split(' ').length, 11);
  assert.equal(sanitiseFailureReason(eleven), eleven);
});

test('every 32-byte hex value goes, including 0x-prefixed ones', () => {
  /*
   * A private key and a transaction hash are the same shape, so nothing here
   * can tell them apart and neither survives. The hash worth keeping arrives
   * through `txHash`, from a transaction result.
   */
  const prefixed = `0x${'1'.repeat(64)}`;
  const bare = 'a'.repeat(64);
  assert.equal(sanitiseFailureReason(`reverted in ${prefixed}`), 'reverted in [redacted]');
  assert.equal(sanitiseFailureReason(`signer ${bare} rejected`), 'signer [redacted] rejected');
  assert.ok(!sanitiseFailureReason(`tx ${prefixed} and key ${bare}`).includes('1'.repeat(8)));
});

test('an address survives, being public and not key-shaped', () => {
  // 20 bytes, 40 hex characters. An error naming no address is much harder
  // to act on, and an address is not a credential.
  const address = '0x93847647d7eb72a69E162117df6a8697dF53EDda';
  assert.equal(sanitiseFailureReason(`provider ${address} not allowed`), `provider ${address} not allowed`);
});

test('a reason is bounded and flattened to one line', () => {
  const stack = `boom${'\n  at somewhere'.repeat(40)}`;
  const out = sanitiseFailureReason(stack);
  assert.ok(out.length <= MAX, `bounded, got ${out.length}`);
  assert.ok(!out.includes('\n'), 'one line, so one log entry');
  assert.equal(sanitiseFailureReason(undefined), '');
  assert.equal(sanitiseFailureReason(new Error('plain')), 'plain');
});
const MAX = 201;

test('the line carries chain, job, phase, action, reason and run time', () => {
  assert.equal(
    deliveryDiagnosticLine({ chainId: 97, jobId: '1585', phase: 'submit', action: 'failed', reason: new Error('boom'), at: '2026-10-22T04:30:00.000Z' }),
    '[delivery-retry] chain=97 job=1585 phase=submit action=failed reason="boom" at=2026-10-22T04:30:00.000Z',
  );
  assert.match(
    deliveryDiagnosticLine({ chainId: 97, jobId: '1572', phase: 'eligibility', action: 'skipped', reason: 'expired — reclaimable by the buyer', at: 'T' }),
    /action=skipped reason="expired/,
  );
});

test('a tx hash appears only when a transaction result supplied one', () => {
  const hash = `0x${'a'.repeat(64)}` as const;
  assert.match(
    deliveryDiagnosticLine({ chainId: 97, jobId: '1585', phase: 'submit', action: 'delivered', txHash: hash, at: 'T' }),
    new RegExp(`tx=${hash}`),
  );
  // Null or absent, and no field appears — rather than an empty one that
  // reads as a hash that failed to print.
  assert.ok(!deliveryDiagnosticLine({ chainId: 97, jobId: '1585', phase: 'submit', action: 'delivered', txHash: null, at: 'T' }).includes('tx='));
  assert.ok(!deliveryDiagnosticLine({ chainId: 97, jobId: '1585', phase: 'submit', action: 'delivered', at: 'T' }).includes('tx='));
});
