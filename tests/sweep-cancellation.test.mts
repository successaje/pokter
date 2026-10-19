import assert from 'node:assert/strict';
import test from 'node:test';

import { deadlineSignal } from '../src/lib/net/bounded';
import { probeIsEvidence } from '../src/lib/proof/probe-target';

/*
 * Cancelling a sweep has to stop the work, not just stop the waiting.
 *
 * Step three gave the run a budget, but a budget abandons a promise rather
 * than cancelling it: the request carries on against a third party's endpoint
 * for nobody. These tests cover the piece that closes that — two reasons to
 * abort, both kept live, so a call keeps its own ceiling *and* stops when the
 * caller stops caring.
 */

test('a call aborts on its own deadline', async () => {
  const signal = deadlineSignal(20);
  assert.equal(signal.aborted, false);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(signal.aborted, true);
  assert.equal((signal.reason as Error).name, 'TimeoutError');
});

test('a call aborts when the caller does, before its deadline', () => {
  const caller = new AbortController();
  const signal = deadlineSignal(60_000, caller.signal);

  assert.equal(signal.aborted, false);
  caller.abort(new Error('run abandoned'));
  assert.equal(signal.aborted, true, 'the caller does not have to wait for the ceiling');
  assert.equal((signal.reason as Error).message, 'run abandoned');
});

test('a caller signal does not cost the call its own ceiling', async () => {
  // The failure this guards: passing only the caller's signal through, so a
  // call made on behalf of a run that never cancels has no deadline at all.
  const caller = new AbortController();
  const signal = deadlineSignal(20, caller.signal);

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(signal.aborted, true, 'the deadline still fires on its own');
  assert.equal(caller.signal.aborted, false, 'and did not abort the caller');
});

test('an already-cancelled caller aborts the call immediately', () => {
  // How the sweep's per-agent and per-sample checks behave: by the time a
  // later call is reached the signal is already aborted, and nothing is sent.
  const caller = new AbortController();
  caller.abort();
  assert.equal(deadlineSignal(60_000, caller.signal).aborted, true);
});

test('a fetch given a cancelled signal never reaches the network', async () => {
  // The property the threading exists for, end to end: `boundedFetch` and the
  // prober both hand their signal to `fetch`, which refuses before it dials.
  // The URL is unroutable on purpose — if the abort failed to take, this test
  // would hang rather than quietly passing.
  const caller = new AbortController();
  caller.abort();

  await assert.rejects(
    () => fetch('http://127.0.0.1:1/never', { signal: deadlineSignal(60_000, caller.signal) }),
    (error: Error) => error.name === 'AbortError',
  );
});

/*
 * The defect threading a signal introduces, and the rule that answers it.
 *
 * Once a probe's request carries the caller's signal, an abort comes back
 * through the same path a refusal does — `ok: false` with a detail that reads
 * as the endpoint's fault. When the abort is the run's budget it arrives as a
 * `TimeoutError`, which is indistinguishable from an agent that genuinely
 * did not answer in time. Recording either would publish Pokter's own clock
 * as a finding about a builder.
 *
 * `probeAgent` drops a failed sample that coincides with its own abort. These
 * tests pin the decision rule, which is what the sweep relies on.
 */

test('a failure during our own abort is not evidence about the agent', () => {
  const caller = new AbortController();
  caller.abort();
  assert.equal(probeIsEvidence({ ok: false }, caller.signal), false);
});

test('a failure with no abort in play is evidence, as it always was', () => {
  assert.equal(probeIsEvidence({ ok: false }, undefined), true);
  assert.equal(probeIsEvidence({ ok: false }, new AbortController().signal), true);
});

test('a sample that already succeeded is kept whatever happened to the run', () => {
  const caller = new AbortController();
  caller.abort();
  assert.equal(probeIsEvidence({ ok: true }, caller.signal), true, 'a real reading survives the run it was taken in');
});

test('a budget abort is a TimeoutError, which is why the name cannot be the test', () => {
  // The trap: `AbortSignal.timeout` — which is what a run budget is built
  // from — aborts with the same error name a slow endpoint produces. So the
  // rule keys on whether *our* signal fired, never on the error.
  const budget = AbortSignal.timeout(0);
  const probeDeadline = AbortSignal.timeout(0);
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      assert.equal((budget.reason as Error).name, 'TimeoutError');
      assert.equal((probeDeadline.reason as Error).name, 'TimeoutError');
      assert.equal(
        (budget.reason as Error).name,
        (probeDeadline.reason as Error).name,
        'the agent and the run fail identically, so only the signal identity distinguishes them',
      );
      resolve();
    }, 20);
  });
});
