import assert from 'node:assert/strict';
import test from 'node:test';

import { SCENARIOS, KIND_DISCLOSURE, type FixtureScenario } from '../src/lib/proofrun/scenarios';
import { FIXTURE_IDS, FIXTURE_SCENARIO_IDS, FIXTURE_SETUP, fixtureFor } from '../src/features/proofrun/fixtures';
import { forgetRun, jobView, runScenario, scenarioSpec } from '../src/features/proofrun/run';
import { OUTCOME_COPY } from '../src/features/proofrun/Outcome';
import { proofRun, replayRef } from '../src/lib/proofrun/run';
import { checkDeliveredVenusReport, CHECKED_POOL, VENUS_CHAIN_ID } from '../src/lib/delivery/venus-report-check';
import { VENUS_COMPTROLLER } from '../src/lib/assay/venus';

/*
 * What the buyer-facing surface is allowed to say, held to the run that
 * produces it.
 *
 * The library's own tests cover the checker and the receipt. These cover
 * the layer above: that every scenario the page offers can actually be
 * run, that a fixture run cannot acquire the marks of chain history, and
 * that the two labels a reader relies on — the provenance and the
 * freshness — describe the run rather than the request that served it.
 *
 * Nothing here reaches a network. `runFixture` injects the fixture's
 * facts, so there is no path from a scenario run to an RPC.
 */

const FIXTURE_SCENARIOS = SCENARIOS.filter((s): s is FixtureScenario => s.kind === 'fixture');

/** Deterministic, so a reused result can be told from a fresh one by its time. */
const T0 = Date.parse('2026-10-24T12:00:00.000Z');

test('every scenario the catalogue publishes has a position behind it', () => {
  /*
   * The failure this prevents is a button that always errors: the page
   * renders `SCENARIOS`, and a scenario with no fixture would be offered
   * and then refused. The reverse is dead data nobody can reach.
   */
  assert.deepEqual(
    [...FIXTURE_SCENARIO_IDS].sort(),
    [...FIXTURE_IDS].sort(),
    'the catalogue and the fixtures disagree about which scenarios exist',
  );
  for (const scenario of FIXTURE_SCENARIOS) {
    assert.ok(fixtureFor(scenario.id), `no position for the “${scenario.label}” scenario`);
    assert.ok(FIXTURE_SETUP[scenario.id], `no setup line for the “${scenario.label}” scenario`);
  }
});

test('the catalogue ships no replay, and the page may not invent one', async () => {
  /*
   * A replay needs historical state the free endpoints no longer serve,
   * so one offered here would answer "not verified" every time. The
   * shape is reserved; an id of that kind must be refused rather than
   * run as a fixture.
   */
  assert.equal(SCENARIOS.filter((s) => s.kind === 'replay').length, 0);
  const outcome = await runScenario({ scenarioId: 'not-a-scenario' }, { nowMs: T0 });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.field, 'scenario');
});

test('each scenario reaches the outcome it exists to demonstrate', async () => {
  const expected: Record<string, string> = {
    /* A correct report on an ordinary position. If this stops reaching
       `verified`, the surface can no longer show a reader what passing
       looks like — and a results view that cannot show a pass is not
       showing failures either, it is broken. */
    'normal-borrow': 'verified',
    /* The dollar rows are checked here too, so a correct no-debt report
       is verified rather than left half-unsettled. */
    'zero-debt': 'verified',
    /* The ratio agrees and the debt total does not. */
    'mixed-decimals': 'mismatch',
    /* Pokter cannot see. This one must never be `verified`. */
    'stale-oracle': 'unverifiable',
  };

  for (const scenario of FIXTURE_SCENARIOS) {
    forgetRun({ scenarioId: scenario.id });
    const outcome = await runScenario({ scenarioId: scenario.id }, { nowMs: T0 });
    assert.ok(outcome.ok, `${scenario.id} did not run`);
    assert.equal(outcome.view.result.state, expected[scenario.id], `${scenario.id} reached the wrong state`);
  }
});

test('a position Pokter cannot price passes no figure, and is never verified', async () => {
  forgetRun({ scenarioId: 'stale-oracle' });
  const outcome = await runScenario({ scenarioId: 'stale-oracle' }, { nowMs: T0 });
  assert.ok(outcome.ok);
  const { checks, state } = outcome.view.result;

  assert.notEqual(state, 'verified', 'a run with no reading was reported as verified');
  /*
   * The binding-block check may pass — the report did name a block, and
   * that is settled by the report alone. Every check that needs Venus's
   * own figures must not.
   */
  for (const check of checks.filter((c) => c.id !== 'binding.block')) {
    assert.notEqual(
      check.outcome,
      'passed',
      `${check.id} passed on a run where Venus could not be read, which is the silent pass this feature exists to refuse`,
    );
  }
  for (const check of checks.filter((c) => c.outcome === 'not-verified')) {
    assert.ok(check.limitation, `${check.id} is not verified and does not say why`);
  }
});

test('a fixture run carries none of the marks of chain history', async () => {
  for (const scenario of FIXTURE_SCENARIOS) {
    forgetRun({ scenarioId: scenario.id });
    const outcome = await runScenario({ scenarioId: scenario.id }, { nowMs: T0 });
    assert.ok(outcome.ok);
    const { view } = outcome;

    /* Provenance is not a parameter, and a surface cannot ask for a
       synthetic pass to be counted as customer work. */
    assert.equal(view.result.provenance, 'fixture', `${scenario.id} claimed a provenance it did not have`);
    /* A block hash would assert that this state existed on chain. It is
       the one field a reader would treat as checkable. */
    assert.equal(view.subject.blockHash, null, `${scenario.id} carried a block hash`);
    /* No job: a fixture is not a delivery anyone paid for, and an empty
       job id is a reference a surface can render, not an absence. */
    assert.equal(view.result.job, null, `${scenario.id} carried a job`);
    assert.equal(view.result.replayRef, undefined, `${scenario.id} offered a replay link for a job that does not exist`);
    /* The account is a label, not a wallet somebody holds. */
    assert.match(view.subject.account, /^0xfacade0{32}\d{2}$/, `${scenario.id} used an account that reads as real`);
    /* The page must cite where the figures are actually written down.
       A job-backed run cites nothing, because its figures came from the
       chain — but a fixture always has a file behind it. */
    assert.ok(
      view.source?.includes('fixtures.ts'),
      `${scenario.id} cited a source the page is not reading`,
    );
  }
});

test('a reused result is labelled with the time it was computed, not the time it was served', async () => {
  /*
   * The defect this prevents is invisible in testing by eye, because the
   * number always looks plausible: a held result stamped with the current
   * clock reads as fresh evidence of a check nobody re-ran.
   */
  forgetRun({ scenarioId: 'normal-borrow' });
  const first = await runScenario({ scenarioId: 'normal-borrow' }, { nowMs: T0 });
  assert.ok(first.ok);
  assert.equal(first.view.freshness.kind, 'fresh');
  assert.equal(first.view.freshness.at, new Date(T0).toISOString());

  const later = T0 + 90_000;
  const second = await runScenario({ scenarioId: 'normal-borrow' }, { nowMs: later });
  assert.ok(second.ok);
  assert.equal(second.view.freshness.kind, 'reused');
  assert.equal(
    second.view.freshness.at,
    new Date(T0).toISOString(),
    'a reused result was stamped with the time it was served',
  );
  assert.equal(second.view.freshness.kind === 'reused' && second.view.freshness.heldForSeconds, 90);
  assert.equal(second.view.result.checkedAt, first.view.result.checkedAt, 'a reused result moved its own check time');

  /* And "Run again" genuinely re-runs. */
  forgetRun({ scenarioId: 'normal-borrow' });
  const third = await runScenario({ scenarioId: 'normal-borrow' }, { nowMs: later });
  assert.ok(third.ok);
  assert.equal(third.view.freshness.kind, 'fresh');
  assert.equal(third.view.freshness.at, new Date(later).toISOString());
});

test('a run offers exactly three outcomes, each with a reason when it is not a comparison', async () => {
  assert.deepEqual(Object.keys(OUTCOME_COPY).sort(), ['failed', 'not-verified', 'passed']);

  forgetRun({ scenarioId: 'mixed-decimals' });
  const outcome = await runScenario({ scenarioId: 'mixed-decimals' }, { nowMs: T0 });
  assert.ok(outcome.ok);
  for (const check of outcome.view.result.checks) {
    assert.ok(
      check.outcome in OUTCOME_COPY,
      `${check.id} reported “${check.outcome}”, which the surface has no words for`,
    );
    /* Expected and observed are the evidence, and a row that shows one
       without the other cannot be read. */
    assert.ok(check.expected.length > 0 && check.observed.length > 0, `${check.id} is missing half of its comparison`);
  }
});

test('the sentence that stops a fixture being read as history is the library’s own', () => {
  /*
   * Held here because the panel prints `KIND_DISCLOSURE.fixture` rather
   * than a paraphrase. If the library softens it, this fails here rather
   * than the page quietly saying something weaker than the data does.
   */
  assert.match(KIND_DISCLOSURE.fixture, /never existed on chain/);
  assert.match(KIND_DISCLOSURE.fixture, /contacts no provider/);
});

/* ---------- the job-backed run, which is somebody's real work ---------- */

/**
 * One customer run, built the way the job page builds it.
 *
 * The position is a fixture's, because a test may not depend on a node
 * or on a particular job existing — but the provenance is `customer`,
 * which is the thing under test. What matters here is not the figures;
 * it is that a run marked as a buyer's work carries none of the wording
 * reserved for something Pokter wrote down.
 */
async function aCustomerRun(jobId: string) {
  const fixture = fixtureFor('normal-borrow');
  assert.ok(fixture, 'the normal-borrow position is missing');
  const job = { chainId: VENUS_CHAIN_ID, jobId };
  const spec = scenarioSpec();
  const verification = await checkDeliveredVenusReport({
    subject: { chainId: VENUS_CHAIN_ID, account: fixture.account, pool: CHECKED_POOL },
    manifestText: fixture.report,
    manifestMatchesChain: true,
    readFactsAt: async () => fixture.evidence,
  });
  const run = proofRun({
    job,
    account: fixture.account,
    deployment: VENUS_COMPTROLLER,
    chainId: VENUS_CHAIN_ID,
    verification,
    manifestText: fixture.report,
    brief: `Report the health factor of ${fixture.account}.`,
    blockHash: null,
    provenance: 'customer',
    spec,
  });
  return { view: jobView({ run, spec, job, atMs: T0 }), job };
}

test('a job-backed run is never drawn as something Pokter wrote down', async () => {
  const { view } = await aCustomerRun('57004');

  assert.equal(view.result.provenance, 'customer', 'a buyer\u2019s job lost its provenance');
  /*
   * The three pieces of fixture framing must all be absent. Each one
   * read against customer work would tell a buyer their own paid job was
   * synthetic — the mislabelling that matters most on that page.
   */
  assert.equal(view.kindDisclosure, null, 'a customer run carried the fixture disclosure');
  assert.equal(view.evidenceNote, null, 'a customer run claimed no node was contacted');
  assert.equal(view.methodNote, null, 'a customer run claimed no call was made');
  assert.equal(view.source, null, 'a customer run cited a fixture file');
  assert.equal(view.scenario, null, 'a customer run claimed to be a scenario');
  assert.match(view.title, /57004/, 'the job page does not name the job');
});

test('a job-backed run offers its receipt, and a fixture has none to offer', async () => {
  /*
   * The receipt is the point of a job's page: a reader who would rather
   * check than be told needs the bytes `scripts/proofrun-verify.mts`
   * reads. A fixture has no job to key one by, and offering a download
   * that 404s would be the dead-link class again.
   */
  const { view, job } = await aCustomerRun('57004');
  assert.equal(view.artifactHref, `/api/proofrun/${job.chainId}/${job.jobId}/artifact.json`);
  assert.equal(view.result.replayRef, replayRef(job), 'the run and the link disagree about where it is read');

  forgetRun({ scenarioId: 'normal-borrow' });
  const scenario = await runScenario({ scenarioId: 'normal-borrow' }, { nowMs: T0 });
  assert.ok(scenario.ok);
  assert.equal(scenario.view.artifactHref, null, 'a fixture offered a receipt for a job that does not exist');
});

test('the checker\u2019s own reason reaches the view, for both kinds of run', async () => {
  /*
   * `detail` is the sentence that says *what* went wrong where the
   * per-check limitations are generic. It was lost for one commit when
   * `ProofRun` carried only the result and the receipt, and the page
   * showed nothing in its place rather than inventing one.
   */
  forgetRun({ scenarioId: 'stale-oracle' });
  const blind = await runScenario({ scenarioId: 'stale-oracle' }, { nowMs: T0 });
  assert.ok(blind.ok);
  assert.match(blind.view.reason, /oracle/i, 'the run that cannot be priced does not say why');
  assert.ok(blind.view.method.length > 0, 'the method prose did not reach the view');
  assert.ok(blind.view.tolerances.length > 0, 'the tolerance prose did not reach the view');

  const { view } = await aCustomerRun('57004');
  assert.ok(view.reason.length > 0, 'a customer run reached the page with no reason');
});

test('a criterion states its own tolerance rule, so the page needs no gloss', () => {
  /*
   * The page used to carry a sentence explaining that the stated band
   * was a floor and the checker allowed the larger of it and a
   * proportional one. That gloss existed only because the label said
   * "within 1%" while the result quoted something wider. The labels now
   * carry the rule, inside the hash the agent signs, so there is one
   * statement of it rather than two that could drift.
   */
  const spec = scenarioSpec();
  for (const id of ['hf.value', 'position.debt_usd', 'position.collateral_usd']) {
    const criterion = spec.criteria.find((c) => c.id === id);
    assert.ok(criterion, `${id} is missing from the criteria`);
    assert.match(
      criterion.label,
      /larger of/i,
      `${id} states a tolerance in its check but not in the name a buyer reads`,
    );
  }
  assert.match(spec.versions.criteria, /@2$/, 'the labels changed without the criteria version moving');
});
