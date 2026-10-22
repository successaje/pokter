import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deliveryDiagnosticLine, errorCategory, sanitiseFailureReason } from '../src/lib/erc8183/delivery-diagnostics';

/** Non-null, for the cases that should produce a usable reason. */
const safe = (raw: unknown): string => {
  const out = sanitiseFailureReason(raw);
  assert.notEqual(out, null, 'expected a reason, not a withholding');
  return out as string;
};

test('a quoted JSON secret loses its value and the object survives', () => {
  /*
   * Quotes bound a value exactly, so this is the one case where precision is
   * available — and worth taking, because the surrounding fields are the
   * useful part. A rule that ran to end of line here would redact the job id
   * sitting next to the secret.
   */
  assert.equal(
    safe('upstream said {"apiKey":"sk_live_41d9f","jobId":"1585","status":"denied"}'),
    'upstream said {"apiKey":"[redacted]","jobId":"1585","status":"denied"}',
  );
  assert.equal(
    safe('{"token": "eyJhbGciOiJIUzI1NiJ9", "chain": 97}'),
    '{"token":"[redacted]", "chain": 97}',
  );
  // An escaped quote inside the value does not end it early.
  assert.equal(safe('{"secret":"a\\"b","jobId":"7"}'), '{"secret":"[redacted]","jobId":"7"}');
});

test('a value that starts after the colon and runs onto the next line is withheld', () => {
  /*
   * The shape that defeated the earlier check, which only looked for a label
   * followed immediately by a newline. Here the label has a value on its own
   * line, so the to-end-of-line rule redacted that much and the continuation
   * survived — the leak being the part of the value nobody had bounded.
   *
   * Bounding a multi-line value means parsing one, so the rule is blunt
   * instead: a secret label anywhere in a multi-line message withholds all
   * of it.
   */
  assert.equal(sanitiseFailureReason('login failed\npassword: hunter2-starts-here\nand-continues-here'), null);
  assert.equal(sanitiseFailureReason('password: short\nAND_THE_REST_OF_IT'), null);
  // A label with no newline anywhere is still bounded, and still useful.
  assert.equal(sanitiseFailureReason('login failed password: hunter2'), 'login failed password=[redacted]');
});

test('any secret label in a multiline message withholds all of it', () => {
  // Wherever the label sits, and whatever the value looks like.
  assert.equal(sanitiseFailureReason('line one\nline two mentions a token here\nline three'), null);
  assert.equal(sanitiseFailureReason('apiKey appears first\nthen more lines follow'), null);
  // No secret label, so an ordinary multi-line error is still readable.
  assert.equal(sanitiseFailureReason('submit failed\n  at step two'), 'submit failed at step two');
});

test('a secret whose value is on a later line is withheld entirely', () => {
  /*
   * The leak that every bounded rule here shares: they stop at a newline.
   * `private key:` followed by the value on the next line leaves the value
   * untouched, so there is nothing safe to print and the message is dropped.
   */
  assert.equal(sanitiseFailureReason('submit failed\nprivate key:\n0xabc123 more'), null);
  assert.equal(sanitiseFailureReason('mnemonic =\nabandon ability able'), null);
});

test('a PEM block is withheld entirely', () => {
  // A multi-line value with no delimiter this can rely on.
  assert.equal(sanitiseFailureReason('signer error\n-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq\n-----END PRIVATE KEY-----'), null);
  assert.equal(sanitiseFailureReason('-----BEGIN RSA PRIVATE KEY-----'), null);
});

test('a withheld reason still leaves a usable line', () => {
  /*
   * The point of withholding rather than omitting the line: phase, chain,
   * job and a category are what narrow a cause. Only the free text is
   * untrustworthy.
   */
  const line = deliveryDiagnosticLine({
    chainId: 97, jobId: '1585', phase: 'submit', action: 'failed',
    reason: new Error('boom\nprivate key:\nsecret-here'), at: 'T',
  });
  assert.match(line, /chain=97 job=1585 phase=submit action=failed/);
  assert.match(line, /reason=\[withheld: could not be bounded\]/);
  assert.ok(!line.includes('secret-here'), 'nothing of the message survives');
  assert.match(line, /category=/, 'and a category still says what kind of failure it was');
});

test('the category is a closed set, never the message', () => {
  assert.equal(errorCategory(new Error('The operation was aborted due to timeout')), 'timeout');
  assert.equal(errorCategory(new Error('execution reverted: not provider')), 'reverted');
  assert.equal(errorCategory(new Error('401 Unauthorized')), 'unauthorised');
  assert.equal(errorCategory(new Error('relay refused the request')), 'rejected');
  assert.equal(errorCategory(new Error('fetch failed ECONNRESET')), 'network');
  assert.equal(errorCategory(new Error('job does not exist')), 'not-found');
  assert.equal(errorCategory(new Error('something else entirely')), 'unknown');
  // Nothing of the message leaks through the category itself.
  assert.ok(!errorCategory(new Error('apiKey sk_live_41d9f timeout')).includes('sk_live'));
});

test('a URL is parsed and reduced to its hostname', () => {
  assert.equal(safe('failed: https://bsc-testnet.infura.io/v3/abc123secretkey timed out'), 'failed: [bsc-testnet.infura.io] timed out');
  assert.equal(safe('post to http://relay.internal:8545/rpc?apikey=zzz'), 'post to [relay.internal]');
});

test('an unparseable URL fails closed', () => {
  /*
   * The limit, stated: the pattern ends at whitespace, because a URL has
   * none. A contrived string with a space inside was never one token, and
   * its tail is prose rather than a credential.
   */
  assert.equal(safe('tried http://[::1/v3/secretkey'), 'tried [url]');
  assert.equal(safe('connect http://%zz%zz/path failed'), 'connect [url] failed');
});

test('a bearer token is removed entirely', () => {
  assert.equal(safe('401: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig'), '401: Bearer [redacted]');
});

test('an unquoted labelled secret loses everything to end of line', () => {
  assert.equal(safe('auth failed apiKey: sk_live_41d9f more text'), 'auth failed apiKey=[redacted]');
  assert.equal(safe('private_key=0xdeadbeef and the rest'), 'private_key=[redacted]');
});

test('a bare mnemonic is removed by its length', () => {
  const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
  assert.equal(phrase.split(' ').length, 12);
  /*
   * Adjacent prose goes with it, because trimming the run back would mean
   * deciding which end the phrase starts at — and that decision is what
   * leaked when this matched exact BIP-39 lengths against a greedy run.
   */
  assert.equal(safe(`signer rejected ${phrase}`), '[redacted]');
  // Eleven words, and one of them too long to be BIP-39, so prose survives.
  const prose = 'the transaction was rejected because the account cannot pay for gas';
  assert.equal(safe(prose), prose);
});

test('every 32-byte hex value goes, 0x-prefixed included', () => {
  const prefixed = `0x${'1'.repeat(64)}`;
  assert.equal(safe(`reverted in ${prefixed}`), 'reverted in [redacted]');
  assert.equal(safe(`signer ${'a'.repeat(64)} rejected`), 'signer [redacted] rejected');
});

test('an address survives, being public and not key-shaped', () => {
  const address = '0x93847647d7eb72a69E162117df6a8697dF53EDda';
  assert.equal(safe(`provider ${address} not allowed`), `provider ${address} not allowed`);
});

test('a reason is bounded and flattened to one line', () => {
  const out = safe(`boom${'\n  at somewhere'.repeat(40)}`);
  assert.ok(out.length <= 201, `bounded, got ${out.length}`);
  assert.ok(!out.includes('\n'), 'one line, so one log entry');
  assert.equal(sanitiseFailureReason(undefined), '');
});

test('a tx hash appears only when a transaction result supplied one', () => {
  const hash = `0x${'a'.repeat(64)}` as const;
  assert.match(
    deliveryDiagnosticLine({ chainId: 97, jobId: '1585', phase: 'submit', action: 'delivered', txHash: hash, at: 'T' }),
    new RegExp(`tx=${hash}`),
  );
  assert.ok(!deliveryDiagnosticLine({ chainId: 97, jobId: '1585', phase: 'submit', action: 'delivered', txHash: null, at: 'T' }).includes('tx='));
});
