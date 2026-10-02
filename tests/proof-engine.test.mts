import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  summariseProof,
  FAILING_MAX_SCORE,
  PROVEN_MIN_MEASURERS,
  PROVEN_MIN_PROBES,
  PROVEN_MIN_SCORE,
  PROVEN_MIN_WINDOW_DAYS,
} from '../src/lib/proof/engine';
import type { Attestation } from '../src/lib/proof/attestation';

/*
 * The verdict rule has now been wrong twice in production: once awarding
 * Proven from a list-level signal that could not check independence, once
 * calling an agent measured 286 times "not measured enough to judge". Both
 * were single-expression mistakes in pure functions, which is exactly the
 * class of bug a test catches for free and review did not.
 */

function attestation(over: Partial<Attestation> = {}): Attestation {
  return {
    id: 'a1',
    agentId: '1',
    chainId: 56,
    transactionHash: '0xabc',
    blockNumber: 1,
    ratio: 1,
    dimension: 'uptime',
    window: '1d',
    measuredBy: 'measurer-one',
    reasoning: null,
    method: { probes: PROVEN_MIN_PROBES, windowDays: PROVEN_MIN_WINDOW_DAYS },
    createdAt: '2026-01-01T00:00:00.000Z',
    verified: true,
    ...over,
  };
}

test('no attestations is not measured, never a low score', () => {
  const result = summariseProof([]);
  assert.equal(result.verdict, 'unproven');
  assert.equal(result.score, null, 'an absent measurement must not become 0');
});

test('two independent measurers over the bar are proven', () => {
  const result = summariseProof([
    attestation({ id: 'a', measuredBy: 'measurer-one' }),
    attestation({ id: 'b', measuredBy: 'measurer-two' }),
  ]);
  assert.equal(result.verdict, 'proven');
});

test('Pokter never counts toward independence', () => {
  const result = summariseProof([
    attestation({ id: 'a', measuredBy: 'measurer-one' }),
    attestation({ id: 'b', measuredBy: 'Pokter' }),
  ]);
  assert.equal(
    result.verdict,
    'reliable',
    'our own probing plus one measurer is one measurer',
  );
});

test('casing does not smuggle Pokter into the measurer count', () => {
  const result = summariseProof([
    attestation({ id: 'a', measuredBy: 'measurer-one' }),
    attestation({ id: 'b', measuredBy: 'POKTER' }),
  ]);
  assert.equal(result.verdict, 'reliable');
});

test('a synthetic attestation with no transaction is not a measurer', () => {
  const result = summariseProof([
    attestation({ id: 'a', measuredBy: 'measurer-one' }),
    attestation({ id: 'b', measuredBy: 'measurer-two', transactionHash: null }),
  ]);
  assert.equal(
    result.verdict,
    'reliable',
    'independence requires a published attestation, not an in-process one',
  );
});

test('thin coverage is observed, however well the agent scored', () => {
  const result = summariseProof([
    attestation({ method: { probes: PROVEN_MIN_PROBES - 1, windowDays: 30 } }),
  ]);
  assert.equal(result.verdict, 'observed');
});

test('a short window is observed even with many probes', () => {
  const result = summariseProof([
    attestation({ method: { probes: 500, windowDays: 0 } }),
  ]);
  assert.equal(result.verdict, 'observed');
});

test('heavy coverage at a mediocre score is emerging, not observed', () => {
  /*
   * The production bug. An agent probed hundreds of times at 88% had been
   * examined thoroughly; calling it "too few probes to judge yet" was false.
   */
  const result = summariseProof([
    attestation({ ratio: 0.888, method: { probes: 286, windowDays: 28 } }),
  ]);
  assert.equal(result.verdict, 'emerging');
});

test('below the failing bar is failing however much we looked', () => {
  const result = summariseProof([
    attestation({
      ratio: FAILING_MAX_SCORE - 0.01,
      method: { probes: 500, windowDays: 30 },
    }),
  ]);
  assert.equal(result.verdict, 'failing');
});

test('exactly at the failing bar is not failing', () => {
  const result = summariseProof([
    attestation({
      ratio: FAILING_MAX_SCORE,
      method: { probes: 500, windowDays: 30 },
    }),
  ]);
  assert.notEqual(result.verdict, 'failing');
});

test('two measurers below the proven score do not reach proven', () => {
  const result = summariseProof([
    attestation({ id: 'a', measuredBy: 'one', ratio: PROVEN_MIN_SCORE - 0.01 }),
    attestation({ id: 'b', measuredBy: 'two', ratio: PROVEN_MIN_SCORE - 0.01 }),
  ]);
  assert.equal(result.verdict, 'emerging');
});

test('an undecodable attestation is not evidence', () => {
  const result = summariseProof([attestation({ verified: false })]);
  assert.equal(
    result.verdict,
    'unproven',
    'a receipt that does not decode is not a receipt',
  );
});

test('the independence bar is what the constant says it is', () => {
  const measurers = Array.from({ length: PROVEN_MIN_MEASURERS }, (_, i) =>
    attestation({ id: `m${i}`, measuredBy: `measurer-${i}` }),
  );
  assert.equal(summariseProof(measurers).verdict, 'proven');
  assert.equal(summariseProof(measurers.slice(0, -1)).verdict, 'reliable');
});

/*
 * Which verdicts take the normal hire path.
 *
 * This pairing has already broken once: `recommendedForHire` read
 * `proven || emerging` from before `observed` existed, so splitting the thin
 * record out of `emerging` quietly moved it onto the risk-acceptance path and
 * an agent answering every probe it had been given was told it required
 * explicit risk acceptance. Pinned per verdict so the next tier added has to
 * decide this deliberately.
 */
test('evidence that exists and is not bad takes the normal hire path', () => {
  const proven = summariseProof([
    attestation({ id: 'a', measuredBy: 'one' }),
    attestation({ id: 'b', measuredBy: 'two' }),
  ]);
  const reliable = summariseProof([attestation()]);
  const emerging = summariseProof([
    attestation({ ratio: 0.7, method: { probes: 200, windowDays: 30 } }),
  ]);
  const observed = summariseProof([
    attestation({ method: { probes: 20, windowDays: 2 } }),
  ]);

  assert.equal(proven.verdict, 'proven');
  assert.equal(reliable.verdict, 'reliable');
  assert.equal(emerging.verdict, 'emerging');
  assert.equal(observed.verdict, 'observed');

  for (const result of [proven, reliable, emerging, observed]) {
    assert.equal(
      result.recommendedForHire,
      true,
      `${result.verdict} should not demand risk acceptance`,
    );
  }
});

test('failing and unmeasured require explicit risk acceptance', () => {
  const failing = summariseProof([
    attestation({ ratio: 0.2, method: { probes: 200, windowDays: 30 } }),
  ]);
  const unproven = summariseProof([]);

  assert.equal(failing.verdict, 'failing');
  assert.equal(unproven.verdict, 'unproven');
  assert.equal(failing.recommendedForHire, false);
  assert.equal(unproven.recommendedForHire, false);
});

test('every verdict states a hire path, so a new tier cannot default in', () => {
  const byVerdict = new Map(
    [
      summariseProof([
        attestation({ id: 'a', measuredBy: 'one' }),
        attestation({ id: 'b', measuredBy: 'two' }),
      ]),
      summariseProof([attestation()]),
      summariseProof([
        attestation({ ratio: 0.7, method: { probes: 200, windowDays: 30 } }),
      ]),
      summariseProof([attestation({ method: { probes: 20, windowDays: 2 } })]),
      summariseProof([
        attestation({ ratio: 0.2, method: { probes: 200, windowDays: 30 } }),
      ]),
      summariseProof([]),
    ].map((result) => [result.verdict, result.recommendedForHire]),
  );

  assert.deepEqual(
    Object.fromEntries(byVerdict),
    {
      proven: true,
      reliable: true,
      emerging: true,
      observed: true,
      failing: false,
      unproven: false,
    },
    'the six states and their hire paths, stated in one place',
  );
});

/*
 * The split that made the badge mean something.
 *
 * Two thirds of the listed catalogue returned `emerging`, and inside it sat
 * agents answering every one of ~240 probes beside agents missing a third of
 * them. These pin the boundary so the tiers cannot quietly re-merge.
 */
test('the quality split sits exactly on the proven score bar', () => {
  const measured = (ratio: number) =>
    summariseProof([
      attestation({ ratio, method: { probes: 200, windowDays: 30 } }),
    ]).verdict;

  assert.equal(measured(PROVEN_MIN_SCORE), 'reliable', 'at the bar is reliable');
  assert.equal(measured(PROVEN_MIN_SCORE - 0.01), 'emerging');
  assert.equal(measured(1), 'reliable', 'a flawless record is not "emerging"');
});
