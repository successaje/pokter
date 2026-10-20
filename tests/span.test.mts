import assert from 'node:assert/strict';
import { test } from 'node:test';

import { timed, timedSync } from '../src/lib/health/span';

test('a span separates computing from waiting', async () => {
  /*
   * The distinction the outage needed and never had. Three explanations were
   * offered on 20 October and none established whether the time went on the
   * CPU or on waiting for something else, which is the question that decides
   * what to fix.
   */
  const spin = (ms: number) => {
    const until = Date.now() + ms;
    let n = 0;
    while (Date.now() < until) n += 1;
    return n;
  };

  // Burning CPU: elapsed and cpu should both be substantial.
  assert.ok(timedSync('test.cpu', () => spin(60)) > 0);

  // Waiting: elapsed substantial, cpu near nothing.
  const waited = await timed('test.wait', async () => {
    await new Promise((r) => setTimeout(r, 60));
    return 'done';
  });
  assert.equal(waited, 'done');
});

test('a span returns its value and does not swallow a throw', async () => {
  assert.equal(timedSync('test.value', () => 41 + 1), 42);
  assert.equal(await timed('test.value', async () => 'through'), 'through');

  // A span must not change how a failure reaches the caller: it times what
  // happened and gets out of the way.
  await assert.rejects(
    timed('test.throws', async () => {
      throw new Error('upstream refused');
    }),
    /upstream refused/,
  );
  assert.throws(() => timedSync('test.throws', () => {
    throw new Error('store unreadable');
  }), /store unreadable/);
});

test('the label is the only thing a call site can put in the log', () => {
  /*
   * Guards the privacy property rather than the timing: the signature takes
   * a label and a thunk, so a caller cannot pass request content through to
   * the log line even by accident. If this ever grows a second string
   * parameter, that is the moment to think again.
   */
  assert.equal(timed.length, 2, 'timed(label, fn)');
  assert.equal(timedSync.length, 2, 'timedSync(label, fn)');
});
