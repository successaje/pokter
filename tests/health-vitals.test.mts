import assert from 'node:assert/strict';
import test from 'node:test';

import { boundedFetch } from '../src/lib/net/bounded';
import { noteSweepFinished, outboundStarted, readVitals, resetVitals } from '../src/lib/health/vitals';

test.beforeEach(() => resetVitals());

test('an outbound call is counted while it is open and not after', () => {
  const settled = outboundStarted();
  assert.equal(readVitals().outbound.inFlight, 1);
  settled();
  assert.equal(readVitals().outbound.inFlight, 0);
});

test('the oldest open call is the one reported, not the newest', () => {
  // This is the number that says "work is piling up and not draining", so
  // reporting the most recent call's age would say the opposite of the truth.
  const now = 1_000_000;
  const first = outboundStarted(now);
  outboundStarted(now + 5_000);

  assert.equal(readVitals(now + 9_000).outbound.oldestOpenMs, 9_000);
  first();
  assert.equal(readVitals(now + 9_000).outbound.oldestOpenMs, 4_000, 'now the second call is the oldest');
});

test('nothing open reports no age rather than zero', () => {
  // Zero would read as "a call opened this instant", which is a different
  // claim from "there are none".
  assert.equal(readVitals().outbound.oldestOpenMs, null);
});

test('a settle path that runs twice does not drive the count negative', () => {
  const settled = outboundStarted();
  settled();
  settled();
  assert.equal(readVitals().outbound.inFlight, 0);
});

test('only deadlines are counted as timeouts, not cancellations', () => {
  // A caller aborting is the process shedding work on purpose; counting it
  // as a timeout would make deliberate load-shedding look like an incident.
  outboundStarted()(true);
  outboundStarted()(false);
  assert.equal(readVitals().outbound.timedOutRecently, 1);
});

test('the timeout count is a recent window, not a running total', () => {
  outboundStarted()(true);
  assert.equal(readVitals().outbound.timedOutRecently, 1);
  // Six minutes later the window has moved past it.
  assert.equal(readVitals(Date.now() + 6 * 60_000).outbound.timedOutRecently, 0);
});

test('a late health check is read as the process falling behind', () => {
  const now = 2_000_000;
  readVitals(now);

  const onTime = readVitals(now + 30_000);
  assert.equal(onTime.sinceLastCheckMs, 30_000);
  assert.equal(onTime.reasons.some((r) => r.includes('arrived')), false, 'the interval itself is not a fault');

  // One check the platform skipped lands at twice the interval. That is Fly
  // missing a check, not this process struggling, and must not be reported.
  const missedOne = readVitals(now + 90_000);
  assert.equal(missedOne.sinceLastCheckMs, 60_000);
  assert.equal(missedOne.saturated, false, 'a single missed check is not a fault');

  const stalled = readVitals(now + 90_000 + 95_000);
  assert.equal(stalled.saturated, true);
  assert.match(stalled.reasons.join(), /arrived 95s after the last/);
});

test('the first check of a process is never late', () => {
  // There is no previous check to be late against, and a fresh boot must not
  // report itself saturated.
  const first = readVitals();
  assert.equal(first.sinceLastCheckMs, null);
  assert.equal(first.saturated, false);
});

test('sweep staleness is reported and marked as not gating', () => {
  assert.equal(readVitals().lastSweepFinishedAt, null, 'a fresh process has seen no sweep');

  noteSweepFinished('2026-10-19T12:00:00Z');
  assert.equal(readVitals().lastSweepFinishedAt, '2026-10-19T12:00:00Z');
});

test('a sweep can never make the check report a fault', () => {
  /*
   * The property step five exists for. A check that a running sweep can fail
   * gets the machine recycled mid-sweep, so no sweep ever finishes — and a
   * check that reads the probe store would wait on whatever lock the sweep
   * is holding. So: no sweep state, however stale or absent, contributes a
   * reason. Only the process's own condition does.
   */
  noteSweepFinished('2020-01-01T00:00:00Z'); // years stale
  assert.equal(readVitals().saturated, false, 'a stale sweep is not a health fault');

  resetVitals();
  assert.equal(readVitals().saturated, false, 'nor is never having swept');

  // Nor does a sweep's outbound load on its own: four calls at the sweep's
  // own concurrency, all healthy, is what a working sweep looks like.
  const now = 3_000_000;
  for (let i = 0; i < 4; i += 1) outboundStarted(now);
  assert.equal(readVitals(now + 2_000).saturated, false);
});

test('a call open past every deadline is a broken invariant, and reported', () => {
  // No `boundedFetch` call can legitimately be open this long — each carries
  // a ceiling of a few seconds. One that is means a call escaped its
  // deadline, which is the condition that took the site down.
  const now = 4_000_000;
  outboundStarted(now);

  assert.equal(readVitals(now + 30_000).saturated, false, 'thirty seconds is slow, not broken');

  const breached = readVitals(now + 61_000);
  assert.equal(breached.saturated, true);
  assert.match(breached.reasons.join(), /open 61s, past every deadline/);
});

test('a few upstream timeouts are normal; a flood of them is reported', () => {
  /*
   * The signal that would actually have caught 19 October. Lag catches a
   * process out of CPU; this catches one waiting on something that will never
   * answer, which is what those eight hours were — and why a check that
   * looked only at itself went on saying `ok` throughout.
   */
  for (let i = 0; i < 5; i += 1) outboundStarted()(true);
  assert.equal(readVitals().saturated, false, 'a handful is an upstream having a bad minute');

  for (let i = 0; i < 20; i += 1) outboundStarted()(true);
  const flooded = readVitals();
  assert.equal(flooded.outbound.timedOutRecently, 25);
  assert.equal(flooded.saturated, true);
  // The wording has to name the upstream: this is not a fault of this
  // machine, and the one report an operator reads must not imply it is.
  assert.match(flooded.reasons.join(), /upstream calls hit their deadline/);
});

test('the counters are actually wired to the fetch everything goes through', async () => {
  /*
   * The unit tests above drive `outboundStarted` directly, which proves the
   * arithmetic and nothing about whether anything calls it. A counter that
   * reads zero forever is indistinguishable from a healthy one, and that is
   * the failure this whole module exists to stop being invisible — so the
   * connection itself is tested.
   *
   * 10.255.255.1 is a private address nothing answers on, so the call stays
   * open long enough to sample and then hits its own deadline.
   */
  const call = boundedFetch('http://10.255.255.1/never', { timeoutMs: 400 }).catch(
    (error: Error) => error.name,
  );

  await new Promise((resolve) => setTimeout(resolve, 150));
  const during = readVitals().outbound;
  assert.equal(during.inFlight, 1, 'an open call is counted');
  assert.ok((during.oldestOpenMs ?? 0) >= 100, 'and its age is reported');

  assert.equal(await call, 'TimeoutError');
  const after = readVitals().outbound;
  assert.equal(after.inFlight, 0, 'a settled call is not');
  assert.equal(after.timedOutRecently, 1, 'and a deadline reached is counted as one');
});
