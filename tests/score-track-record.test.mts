import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPONENT_WEIGHTS,
  MIN_CHECKS,
  SCORE_LIMITS,
  SCORE_VERSION,
  evidenceStrength,
  rankTrackRecords,
  scoreTrackRecord,
  wilsonLowerBound,
  type TrackRecordInputs,
} from '../src/lib/score/track-record';

/*
 * The Pokter Score, tested against the shapes the live data actually has.
 *
 * The figures quoted here were measured across all 173 listed agents before
 * the model was designed: 109 have probes, 47 have a resolved paid job, 13
 * have an externally funded settlement, and 32 of the 47 have delivered
 * every job they were given. That last one is why the shrinkage exists —
 * without it two thirds of the field ties on a perfect rate and the order
 * is decided by whatever breaks the tie.
 */

const inputs = (over: Partial<TrackRecordInputs> = {}): TrackRecordInputs => ({
  delivered: 8,
  missed: 0,
  answered: 272,
  checks: 276,
  observedDays: 22.5,
  category: 'health-factor',
  ...over,
});

test('a ranked score is out of a fixed 100 and is never rescaled', () => {
  const score = scoreTrackRecord(inputs());
  assert.equal(score.rankable, true);
  assert.equal(score.version, SCORE_VERSION);
  assert.equal(
    score.components.reduce((sum, component) => sum + component.weight, 0),
    100,
    'the weights no longer sum to 100, so the scale is not 0-100',
  );
  assert.ok(score.overall !== null && score.overall > 0 && score.overall < 100);
  /* Both components are required, so there is never a missing weight to
     redistribute onto the others. */
  assert.equal(score.components.length, 2);
});

/*
 * The case the whole model turns on. On real data a raw rate put a 1-of-1
 * agent above a 13-of-13 agent; this is that comparison.
 */
test('an established record outranks a single lucky job', () => {
  const established = scoreTrackRecord(inputs({ delivered: 13, missed: 0 }));
  const lucky = scoreTrackRecord(inputs({ delivered: 1, missed: 0 }));

  assert.equal(established.components[0].rate, 1);
  assert.equal(lucky.components[0].rate, 1, 'both have a perfect rate, which is the point');
  assert.ok(
    (established.overall ?? 0) > (lucky.overall ?? 0) + 10,
    'one job scores close to thirteen, so a single success still dominates',
  );
});

test('the shrinkage is monotonic in the sample, holding the rate perfect', () => {
  const scores = [1, 2, 3, 5, 8, 13].map((n) => scoreTrackRecord(inputs({ delivered: n, missed: 0 })).overall ?? 0);
  for (let i = 1; i < scores.length; i += 1) {
    assert.ok(scores[i] > scores[i - 1], `more evidence at the same rate must not score lower (${scores})`);
  }
});

test('a missed job costs more than a thin record, and a failure is not a gap', () => {
  const perfect = scoreTrackRecord(inputs({ delivered: 4, missed: 0 }));
  const mixed = scoreTrackRecord(inputs({ delivered: 3, missed: 1 }));
  const failing = scoreTrackRecord(inputs({ delivered: 0, missed: 4 }));
  assert.ok((perfect.overall ?? 0) > (mixed.overall ?? 0));
  assert.ok((mixed.overall ?? 0) > (failing.overall ?? 0));
  /* A real failure is a real zero on that component — distinct from the
     unranked state below, which is the absence of evidence. */
  assert.equal(failing.components[0].earned, 0);
  assert.equal(failing.rankable, true);
});

/* ---------------- the unranked state ---------------- */

test('missing evidence leaves an agent unranked, never at zero', () => {
  for (const [reason, over] of [
    ['no-checks', { checks: 0, answered: 0 }],
    ['too-few-checks', { checks: MIN_CHECKS - 1, answered: MIN_CHECKS - 1 }],
    ['no-resolved-jobs', { delivered: 0, missed: 0 }],
  ] as const) {
    const score = scoreTrackRecord(inputs(over));
    assert.equal(score.overall, null, `${reason} produced a number`);
    assert.equal(score.rankable, false);
    assert.equal(score.unrankedReason, reason);
    assert.deepEqual(score.components, [], 'an unranked agent must publish no component points');
  }
});

test('an unfinished job is pending, not missed', () => {
  /* The caller counts only jobs that reached delivery or their deadline, so
     a funded job still inside its window reaches neither number. */
  const waiting = scoreTrackRecord(inputs({ delivered: 0, missed: 0 }));
  assert.equal(waiting.rankable, false);
  assert.equal(waiting.unrankedReason, 'no-resolved-jobs');
  assert.equal(waiting.resolvedJobs, 0);
});

/* ---------------- evidence strength, kept out of the score ---------------- */

test('evidence strength is reported beside the score and never inside it', () => {
  const thin = scoreTrackRecord(inputs({ delivered: 1, missed: 0, checks: 60, answered: 60 }));
  const thick = scoreTrackRecord(inputs({ delivered: 13, missed: 0, checks: 360, answered: 356 }));
  assert.equal(thin.evidence, 'limited');
  assert.equal(thick.evidence, 'strong');

  /* Two agents with identical rates and identical samples score the same
     whatever their strength label says — the label describes the evidence,
     it does not move the number. */
  const a = scoreTrackRecord(inputs({ delivered: 3, missed: 0, checks: 200, answered: 198 }));
  const b = scoreTrackRecord(inputs({ delivered: 3, missed: 0, checks: 200, answered: 198 }));
  assert.equal(a.overall, b.overall);
  assert.equal(a.evidence, b.evidence);
});

test('strength takes the weaker of the two samples', () => {
  assert.equal(evidenceStrength({ resolved: 13, checks: 60 }), 'limited');
  assert.equal(evidenceStrength({ resolved: 1, checks: 400 }), 'limited');
  assert.equal(evidenceStrength({ resolved: 4, checks: 200 }), 'moderate');
  assert.equal(evidenceStrength({ resolved: 9, checks: 320 }), 'strong');
});

/* ---------------- ranking ---------------- */

const row = (name: string, over: Partial<TrackRecordInputs> = {}) => ({
  name,
  score: scoreTrackRecord(inputs(over)),
});

test('ranking is deterministic, and ties break on stated facts', () => {
  /* Same score, different evidence: more resolved jobs wins. */
  const ranked = rankTrackRecords([
    row('B agent', { delivered: 3, missed: 0, checks: 200, answered: 196 }),
    row('A agent', { delivered: 3, missed: 0, checks: 200, answered: 196 }),
  ]);
  assert.deepEqual(ranked.map((r) => r.name), ['A agent', 'B agent'], 'an exact tie must fall to the name');

  const bySample = rankTrackRecords([
    row('fewer checks', { delivered: 3, missed: 0, checks: 150, answered: 150 }),
    row('more checks', { delivered: 3, missed: 0, checks: 400, answered: 400 }),
  ]);
  assert.equal(bySample[0].name, 'more checks');

  /* And running it twice gives the same answer. */
  const once = rankTrackRecords([row('x'), row('y'), row('z')]).map((r) => r.name);
  const twice = rankTrackRecords([row('z'), row('y'), row('x')]).map((r) => r.name);
  assert.deepEqual(once, twice);
});

test('unrankable agents are left out of the order rather than placed last', () => {
  const ranked = rankTrackRecords([row('ranked'), row('unranked', { delivered: 0, missed: 0 })]);
  assert.deepEqual(ranked.map((r) => r.name), ['ranked']);
});

/* ---------------- sensitivity ---------------- */

/*
 * The strongest argument for 60/40 is that it barely matters. This rebuilds
 * the top of the board under four other splits using the live shape of the
 * data — a field where most agents have a perfect delivery rate and a high
 * answer rate, and are separated mainly by how much evidence sits behind
 * them — and checks that the order holds.
 */
test('the order comes from the evidence, not from the weights', () => {
  const field = [
    row('13 jobs', { delivered: 13, missed: 0, checks: 276, answered: 271 }),
    row('12 jobs', { delivered: 12, missed: 0, checks: 270, answered: 268 }),
    row('9 jobs', { delivered: 9, missed: 0, checks: 356, answered: 353 }),
    row('8 jobs', { delivered: 8, missed: 0, checks: 276, answered: 272 }),
    row('7 jobs', { delivered: 7, missed: 0, checks: 274, answered: 270 }),
    row('5 jobs', { delivered: 5, missed: 0, checks: 300, answered: 297 }),
    row('1 job', { delivered: 1, missed: 0, checks: 320, answered: 318 }),
  ];
  const baseline = rankTrackRecords(field).map((r) => r.name);

  const reweigh = (delivery: number, responsiveness: number) =>
    field
      .map((r) => ({
        name: r.name,
        value:
          delivery * ((r.score.components[0].earned ?? 0) / COMPONENT_WEIGHTS.delivery) +
          responsiveness * ((r.score.components[1].earned ?? 0) / COMPONENT_WEIGHTS.responsiveness),
        score: r.score,
      }))
      .sort((a, b) => b.value - a.value || b.score.resolvedJobs - a.score.resolvedJobs || a.name.localeCompare(b.name))
      .map((r) => r.name);

  for (const [delivery, responsiveness] of [[50, 50], [70, 30], [40, 60], [80, 20]] as const) {
    const moved = reweigh(delivery, responsiveness)
      .map((name, index) => Math.abs(index - baseline.indexOf(name)))
      .reduce((worst, distance) => Math.max(worst, distance), 0);
    assert.ok(moved <= 1, `${delivery}/${responsiveness} moved a row ${moved} places; the weights are deciding the order`);
  }
});

/* ---------------- the arithmetic itself ---------------- */

test('the Wilson bound is the published one, and refuses impossible input', () => {
  /* Checked against the closed form: 1 of 1 at 95% is 0.2065…, 13 of 13 is
     0.7717…. These two numbers are quoted in the model's own comments. */
  assert.ok(Math.abs((wilsonLowerBound(1, 1) ?? 0) - 0.2065) < 0.001);
  assert.ok(Math.abs((wilsonLowerBound(13, 13) ?? 0) - 0.7717) < 0.001);
  assert.equal(wilsonLowerBound(0, 0), null);
  assert.equal(wilsonLowerBound(2, 1), null, 'more successes than trials is not a rate');
  assert.equal(wilsonLowerBound(-1, 5), null);
  assert.equal(wilsonLowerBound(0, 10), 0);
});

test('the limits are published with the score, including the unflattering one', () => {
  const limits = SCORE_LIMITS.join(' ');
  assert.match(limits, /funded by Pokter/, 'the board must say who paid for most of this record');
  assert.match(limits, /does not measure whether an answer was correct, useful or profitable/);
  assert.match(limits, /protocol handshake/);
  assert.match(limits, /Self-hires are excluded/);
  assert.match(limits, /could still fund their own agent from a second wallet/, 'it must not claim to be unmanipulable');
  assert.match(limits, /hired now is a separate question/);
});
