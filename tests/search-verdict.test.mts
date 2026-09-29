import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  matchesQuery,
  offersDirectHire,
  verdictFor,
} from '../src/lib/search/match';
import { parseQuery, VERDICTS } from '../src/lib/search/query';
import {
  FAILING_MAX_SCORE,
  PROVEN_MIN_PROBES,
  PROVEN_MIN_WINDOW_DAYS,
} from '../src/lib/proof/engine';

/*
 * The list-level rule. It is deliberately cheaper than the proof engine and
 * has to stay conservative relative to it: understating an agent is tolerable,
 * contradicting the page behind the card is not.
 */
function agent(
  totalProbes: number,
  totalAnswered: number,
  observedDays: number,
  attestationCount = 1,
) {
  return {
    listing: {
      attestationCount,
      category: 'yield',
      agent: { chain_id: 56, token_id: '1', name: 'test-agent' },
    },
    record: { totalProbes, totalAnswered, observedDays },
  } as never;
}

test('never probed and never attested is not measured', () => {
  assert.equal(verdictFor(agent(0, 0, 0, 0)), 'unproven');
});

test('the list level never awards proven', () => {
  /*
   * It cannot: `attestationCount` is a registry tally that says nothing about
   * who wrote the feedbacks. It once badged twenty-one agents Proven that the
   * proof engine held were not.
   */
  const generous = verdictFor(agent(10_000, 10_000, 3650, 99));
  assert.notEqual(generous, 'proven');
});

test('below the coverage bar is observed', () => {
  assert.equal(verdictFor(agent(PROVEN_MIN_PROBES - 1, PROVEN_MIN_PROBES - 1, 5)), 'observed');
  assert.equal(verdictFor(agent(200, 200, PROVEN_MIN_WINDOW_DAYS - 0.1)), 'observed');
});

test('at the coverage bar is emerging', () => {
  assert.equal(
    verdictFor(agent(PROVEN_MIN_PROBES, PROVEN_MIN_PROBES, PROVEN_MIN_WINDOW_DAYS)),
    'emerging',
  );
});

test('heavy coverage at a mediocre rate is emerging, not observed', () => {
  assert.equal(verdictFor(agent(286, 254, 28)), 'emerging');
});

test('the failing bar matches the engine, not zero', () => {
  /*
   * This used to fail only an agent answering nothing at all, so an agent at
   * 30% read failing on its page and emerging on its card.
   */
  assert.equal(verdictFor(agent(200, 60, 5)), 'failing');
  assert.equal(verdictFor(agent(200, Math.ceil(200 * FAILING_MAX_SCORE), 5)), 'emerging');
});

test('every verdict in the vocabulary is filterable', () => {
  /*
   * `is:observed` was added to the vocabulary, the filter shelf and the badge
   * while the matcher still enumerated verdicts by hand, so the chip was
   * offered and matched nothing.
   */
  const cases = [
    agent(0, 0, 0, 0),
    agent(20, 20, 2),
    agent(286, 254, 28),
    agent(200, 20, 5),
  ];

  for (const verdict of VERDICTS) {
    const parsed = parseQuery(`is:${verdict}`);
    assert.equal(parsed.unknown.length, 0, `is:${verdict} must parse`);

    for (const candidate of cases) {
      assert.equal(
        matchesQuery(candidate, parsed),
        verdictFor(candidate) === verdict,
        `is:${verdict} must agree with the badge it filters on`,
      );
    }
  }
});

test('every agent lands in exactly one verdict', () => {
  const cases = [
    agent(0, 0, 0, 0),
    agent(20, 20, 2),
    agent(286, 254, 28),
    agent(200, 20, 5),
    agent(40, 40, 1),
  ];

  for (const candidate of cases) {
    const hits = VERDICTS.filter((v) => verdictFor(candidate) === v);
    assert.equal(hits.length, 1, 'a card shows one badge, so one state must match');
  }
});

test('the card offers hire on the same verdicts the detail page does', () => {
  /*
   * These disagreed: the engine put `observed` on the normal hire path while
   * this function still read `proven || emerging`, so a card withheld the
   * button from an agent whose own page offered it. Both now read one set.
   */
  const measuredThin = agent(20, 20, 2);
  const measuredWell = agent(200, 200, 10);
  const dead = agent(200, 10, 10);
  const never = agent(0, 0, 0, 0);

  assert.equal(verdictFor(measuredThin), 'observed');
  assert.equal(offersDirectHire(measuredThin), true);

  assert.equal(verdictFor(measuredWell), 'emerging');
  assert.equal(offersDirectHire(measuredWell), true);

  assert.equal(verdictFor(dead), 'failing');
  assert.equal(offersDirectHire(dead), false);

  assert.equal(verdictFor(never), 'unproven');
  assert.equal(offersDirectHire(never), false);
});

test('an agent that never answered is never offered hire', () => {
  // Silent endpoints reach the button only through a verdict check, so the
  // record is asserted too: a tier change must not let one through.
  assert.equal(offersDirectHire(agent(50, 0, 5)), false);
});
