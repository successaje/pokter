import assert from 'node:assert/strict';
import test from 'node:test';

import { CHECK_KEY, checkBrief, fixtureJobsBySuite, readCheckMarker } from '../src/lib/assay/paid-brief';
import { answerFromManifest, gradePaidScenario, scenarioOf } from '../src/lib/assay/paid-grade';
import { STATIC_SUITES } from '../src/lib/assay/category-suites';

const manifestWith = (content: unknown): string =>
  JSON.stringify({
    version: 1,
    job_id: 1,
    chain_id: 97,
    response: { content: typeof content === 'string' ? content : JSON.stringify(content), content_type: 'application/json' },
    metadata: { producer: 'Pokter Evidence' },
  });

test('a fixture brief carries its suite and scenario, and the fixture text verbatim', () => {
  const suite = STATIC_SUITES.yield;
  const scenario = suite.scenarios[0];
  const built = checkBrief('yield', scenario.id);
  assert.ok(built);

  const envelope = JSON.parse(built.task) as Record<string, unknown>;
  // The published fixture, unreworded: a check that grades a paraphrase is
  // not grading the published scenario.
  assert.equal(envelope.task, scenario.brief.text);
  assert.deepEqual(envelope.data, scenario.brief.data);
  assert.deepEqual(envelope[CHECK_KEY], { suite: suite.id, scenario: scenario.id });
  assert.deepEqual(readCheckMarker(built.task), { suite: suite.id, scenario: scenario.id });
});

test('an unknown category or scenario builds no brief', () => {
  assert.equal(checkBrief('yield', 'no-such-scenario'), null);
});

test("an ordinary buyer's job is never read as a fixture answer", () => {
  // The decisive case: a real hire graded against an expected value it was
  // never asked for would publish a correctness failure the agent did not earn.
  for (const task of [
    JSON.stringify({ task: 'Check my Venus position', requested_by: 'someone' }),
    JSON.stringify({ task: 'x', [CHECK_KEY]: 'not-an-object' }),
    JSON.stringify({ task: 'x', [CHECK_KEY]: { suite: 'only-suite' } }),
    JSON.stringify({ task: 'x', [CHECK_KEY]: { suite: '', scenario: '' } }),
    'plain prose, not JSON at all',
    '',
  ]) {
    assert.equal(readCheckMarker(task), null, task.slice(0, 40));
  }
  assert.equal(readCheckMarker(null), null);
  assert.equal(readCheckMarker(undefined), null);
});

test('an answer is read out of the manifest whether it is nested JSON or an object', () => {
  assert.deepEqual(answerFromManifest(manifestWith({ best_route: 'route-a' })), { text: null, data: { best_route: 'route-a' } });
  // Some producers store the object directly rather than as a JSON string.
  const direct = JSON.stringify({ response: { content: { best_route: 'route-a' } } });
  assert.deepEqual(answerFromManifest(direct), { text: null, data: { best_route: 'route-a' } });
  // Prose survives as text, to be graded and fail on its merits.
  assert.deepEqual(answerFromManifest(manifestWith('I could not work this out')), { text: 'I could not work this out', data: null });
  assert.equal(answerFromManifest('not json'), null);
  assert.equal(answerFromManifest(JSON.stringify({ no: 'response' })), null);
});

test('a correct delivered artifact passes and keeps the job that paid for it', () => {
  const scenario = scenarioOf('yield', STATIC_SUITES.yield.scenarios[0].id);
  assert.ok(scenario);
  const result = gradePaidScenario({ scenario, jobId: '1453', manifestText: manifestWith(scenario.expected) });

  assert.equal(result.pass, true);
  assert.equal(result.outcome, 'correct');
  assert.equal(result.jobId, '1453', 'the receipt a reader can check the claim against');
});

test('a wrong answer fails as wrong, and an undelivered job fails as undelivered', () => {
  const scenario = scenarioOf('yield', STATIC_SUITES.yield.scenarios[0].id);
  assert.ok(scenario);

  const wrong = gradePaidScenario({ scenario, jobId: '1', manifestText: manifestWith({ ...scenario.expected, best_route: 'definitely-not' }) });
  assert.equal(wrong.pass, false);
  assert.equal(wrong.outcome, 'wrong');

  /*
   * Paid and never delivered is a failure of the check, not missing
   * evidence — the buyer paid and got nothing — and a reader deciding
   * whether to hire needs to see which of the two happened.
   */
  const missing = gradePaidScenario({ scenario, jobId: '2', manifestText: null });
  assert.equal(missing.pass, false);
  assert.equal(missing.outcome, 'undelivered');
  assert.match(missing.reason, /window closed with no deliverable submitted/);
});

const hiredJob = (jobId: string, task: string, hiredAt: string) =>
  ({
    id: jobId, jobId, chainId: 97, isTestnet: true, agentTokenId: '2619', agentName: 'A',
    provider: '0x0000000000000000000000000000000000000001', task, budgetRaw: '0', expiredAt: hiredAt,
    hiredAt, hireTxHash: null, status: 'COMPLETED', statusCheckedAt: hiredAt, deliverableUrl: null, settleTxHash: null,
  }) as unknown as import('../src/lib/erc8183/types').HiredJob;

test('fixture jobs are matched per scenario, newest winning', () => {
  const suite = STATIC_SUITES.yield;
  const [first, second] = suite.scenarios;
  const old = checkBrief('yield', first.id)!.task;
  const fresh = checkBrief('yield', first.id)!.task;
  const other = checkBrief('yield', second.id)!.task;

  const jobs = [
    hiredJob('10', old, '2026-10-01T00:00:00Z'),
    hiredJob('11', fresh, '2026-10-09T00:00:00Z'),
    hiredJob('12', other, '2026-10-02T00:00:00Z'),
    // An ordinary hire, and a fixture from a different suite.
    hiredJob('13', JSON.stringify({ task: 'something a buyer wanted' }), '2026-10-10T00:00:00Z'),
    hiredJob('14', checkBrief('grid-trading', STATIC_SUITES['grid-trading'].scenarios[0].id)!.task, '2026-10-11T00:00:00Z'),
  ];

  const found = fixtureJobsBySuite(jobs, suite.id);
  assert.equal(found.size, 2, 'only this suite’s fixtures');
  assert.equal(found.get(first.id)?.jobId, '11', 'a re-run supersedes the earlier attempt');
  assert.equal(found.get(second.id)?.jobId, '12');
});

test('no fixture jobs means no fixtures found, not a failing check', () => {
  // The publishing decision lives in the runner, which records nothing
  // while any scenario is unhired; this is the input that tells it so.
  const jobs = [hiredJob('1', JSON.stringify({ task: 'a real brief' }), '2026-10-01T00:00:00Z')];
  assert.equal(fixtureJobsBySuite(jobs, STATIC_SUITES.yield.id).size, 0);
});

test('a funded fixture inside its window is pending, not undelivered', () => {
  /*
   * The first real run of this check recorded "0 of 2" against an agent
   * whose fixtures had been funded forty seconds earlier. Funded-and-waiting
   * and funded-and-never-delivered are different facts about the agent.
   */
  const scenario = scenarioOf('yield', STATIC_SUITES.yield.scenarios[0].id)!;

  const pending = gradePaidScenario({ scenario, jobId: '1460', manifestText: null, deliveryOpen: true });
  assert.equal(pending.outcome, 'pending');
  assert.equal(pending.pass, false);
  assert.match(pending.reason, /may still deliver/);

  const closed = gradePaidScenario({ scenario, jobId: '1461', manifestText: null, deliveryOpen: false });
  assert.equal(closed.outcome, 'undelivered');
  assert.match(closed.reason, /window closed/);
});
