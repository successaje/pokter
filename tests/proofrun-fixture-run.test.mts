import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { checkArtifactIntegrity, compareRuns, sealArtifact } from '../src/lib/proofrun/artifact';
import { fixtureFacts, runFixture, type ProofRunFixture } from '../src/lib/proofrun/fixture-run';
import { specHashOf } from '../src/lib/proofrun/acceptance';
import { checkSpecIntegrity } from '../src/lib/proofrun/artifact';

/*
 * The route a buyer is asked to believe, run end to end on a written-down
 * position: a report, the checker, the named checks, a sealed receipt,
 * and a replay of it.
 *
 * Built on `tests/fixtures/deliverable-57004.json`, a real delivered
 * Venus report, so the shape being parsed is one an agent actually
 * produced rather than one invented to be easy to parse. The position it
 * is checked against is synthetic — nothing here reaches a network, and
 * `runFixture` has no path to one.
 */
const REAL_REPORT = readFileSync(new URL('./fixtures/deliverable-57004.json', import.meta.url), 'utf8');
const ACCOUNT = '0x4f43d4173227bF19b180f1f54804bF2C9045297B';
const BLOCK = 127782760n;

/** The position the report describes, so a correct report agrees with it. */
const TRUE_FACTS = fixtureFacts({
  account: ACCOUNT,
  block: BLOCK,
  blockTime: '2026-10-15T11:59:31.000Z',
  healthFactor: 1.8655,
  borrowLimitRatio: 0.9583,
  liquidatable: false,
  debtUsd: 130011.88,
  collateralUsd: 376368.41,
});

const correct: ProofRunFixture = {
  id: 'normal-borrow',
  why: 'An ordinary position where a correct answer is available and checkable.',
  report: REAL_REPORT,
  account: ACCOUNT,
  evidence: { available: true, facts: TRUE_FACTS },
};

/**
 * The same report, stating the two fields the real delivery omits.
 *
 * Needed because a replay can only reach `agreed` when every check
 * settled: `compareRuns` treats a check that is not verified on either
 * side as neither confirmed nor contradicted, which is the point of it.
 * So a fully-settling fixture is what the replay path has to be proved
 * against, and the real delivery — which names no chain and no
 * liquidation flag — proves the partial case instead.
 */
function completeReport(): string {
  const manifest = JSON.parse(REAL_REPORT) as { response: { content: string } };
  const body = JSON.parse(manifest.response.content) as Record<string, unknown>;
  body.chain_id = 56;
  body.liquidatable = false;
  manifest.response.content = JSON.stringify(body);
  return JSON.stringify(manifest);
}

const complete: ProofRunFixture = { ...correct, id: 'normal-borrow-complete', report: completeReport() };

/** The same report with one figure changed: confidently stated, and wrong. */
function reportWithHealthFactor(value: number): string {
  const manifest = JSON.parse(REAL_REPORT) as { response: { content: string } };
  const body = JSON.parse(manifest.response.content) as Record<string, unknown>;
  body.health_factor = value;
  manifest.response.content = JSON.stringify(body);
  return JSON.stringify(manifest);
}

/*
 * A correct report contradicts nothing, and every figure it actually
 * states is checked.
 *
 * Not "all seven pass", which is what this asserted first and was wrong
 * about. This real delivery states no liquidation flag and names no
 * chain, so those two criteria are honestly unsettled — the report did
 * not say. Demanding a pass there would have meant inventing agreement
 * on fields nobody compared, which is the failure the whole feature is
 * built to refuse, and the test would have been the thing asking for it.
 */
test('a correct report fails nothing and passes every figure it states', async () => {
  const run = await runFixture(correct);
  const failed = run.result.checks.filter((c) => c.outcome === 'failed');
  assert.deepEqual(failed, [], `a correct report failed: ${failed.map((c) => c.id).join(', ')}`);

  for (const id of ['hf.value', 'position.debt_usd', 'position.collateral_usd', 'binding.block', 'binding.account']) {
    const check = run.result.checks.find((c) => c.id === id);
    assert.equal(check?.outcome, 'passed', `${id} did not pass on a correct report: ${check?.limitation ?? 'missing'}`);
  }

  /* Stated by neither this report nor any other it was built from. */
  for (const id of ['hf.liquidatable', 'binding.chain']) {
    assert.equal(run.result.checks.find((c) => c.id === id)?.outcome, 'not-verified');
  }

  /* And the summary must not read as verified while two checks are not. */
  assert.equal(run.result.state, 'unverifiable');
  assert.match(run.result.headline, /could not be checked/);
});

/*
 * The demo this feature exists for: a report that is wrong in one figure
 * and confident about it fails that check by name, and the others still
 * pass. A verifier that failed everything on one bad figure would be
 * useless for finding where an agent breaks.
 */
test('a confidently wrong report fails the specific check it is wrong about', async () => {
  const run = await runFixture({ ...correct, report: reportWithHealthFactor(2.9) });
  const hf = run.result.checks.find((c) => c.id === 'hf.value');
  assert.equal(hf?.outcome, 'failed', 'the wrong health factor did not fail its own check');
  assert.match(hf?.observed ?? '', /2\.9/, 'the check does not show what the report claimed');
  assert.match(hf?.expected ?? '', /1\.8/, 'the check does not show what Venus said');
  assert.equal(run.result.state, 'mismatch');
  assert.match(run.result.headline, /contradicted the report/);
});

/*
 * Evidence that is not there never becomes a pass. This is the case a
 * verifier is most likely to get wrong, because the easy implementation
 * returns "nothing disagreed".
 */
test('a pruned node leaves checks unverified and the run never verified', async () => {
  const run = await runFixture({
    ...correct,
    evidence: { available: false, code: 'no-history', detail: 'the node no longer keeps that block.' },
  });
  assert.notEqual(run.result.state, 'verified');
  assert.ok(run.result.checks.every((c) => c.outcome !== 'passed' || c.id === 'binding.block'));
  assert.ok(run.result.checks.some((c) => c.outcome === 'not-verified'));
});

/*
 * The harness refuses a block the fixture does not hold, rather than
 * answering anyway because it is only a fixture. A lenient harness would
 * let a report naming the wrong block pass here and fail in production.
 */
test('the fixture reader refuses a block it does not hold', async () => {
  const run = await runFixture({
    ...correct,
    evidence: { available: true, facts: { ...TRUE_FACTS, block: BLOCK + 1n } },
  });
  assert.notEqual(run.result.state, 'verified');
});

/* A fixture run must never be mistakable for work somebody paid for. */
test('a fixture run says it is a fixture and carries no job or block hash', async () => {
  const run = await runFixture(correct);
  assert.equal(run.result.provenance, 'fixture');
  assert.equal(run.sealed.artifact.provenance, 'fixture');
  assert.equal(run.sealed.artifact.job, null, 'a fixture carried a job reference');
  assert.equal(run.sealed.artifact.subject.blockHash, null, 'a fixture claimed an on-chain block hash');
  assert.equal(run.result.replayRef, undefined, 'a fixture offered a replay link for a job that does not exist');
});

/* ---------- the full route, including replay ---------- */

test('a sealed receipt replays to agreement, and a tampered one is refused', async () => {
  const first = await runFixture(complete, { checkedAt: '2026-10-24T00:00:00.000Z' });
  assert.deepEqual(checkArtifactIntegrity(first.sealed), { ok: true });
  assert.deepEqual(checkSpecIntegrity(first.sealed.artifact, specHashOf), { ok: true });

  /* Re-running the same fixture is what an independent verifier does:
     same inputs, same block, its own comparison. */
  const replay = await runFixture(complete, { checkedAt: '2026-10-25T00:00:00.000Z' });
  assert.equal(compareRuns(first.sealed.artifact.checks, replay.result.checks).state, 'agreed');

  /* Editing an outcome inside an otherwise valid receipt. */
  const edited = {
    ...first.sealed.artifact,
    checks: first.sealed.artifact.checks.map((c) => (c.id === 'hf.value' ? { ...c, outcome: 'failed' as const } : c)),
  };
  assert.equal(checkArtifactIntegrity({ ...first.sealed, artifact: edited }).ok, false);

  /* And a receipt re-sealed around the edit: the artifact hash is valid
     again, so only the replay can catch it — which it must, as a
     contradiction rather than as a pass. */
  const resealed = sealArtifact(edited);
  assert.deepEqual(checkArtifactIntegrity(resealed), { ok: true }, 'the re-sealed artifact should itself be intact');
  const outcome = compareRuns(resealed.artifact.checks, replay.result.checks);
  assert.equal(outcome.state, 'contradicted', 'a re-sealed edit replayed as agreement');
  assert.notEqual(outcome.state, 'agreed');
});

/*
 * Criteria swapped inside a receipt that is otherwise intact. The
 * artifact hash cannot see it, because it was recomputed over the edit;
 * the spec hash can, because the criteria no longer hash to what the
 * receipt names as agreed.
 */
test('criteria swapped in a re-sealed receipt fail the spec check', async () => {
  const run = await runFixture(correct);
  const swapped = sealArtifact({ ...run.sealed.artifact, criteria: run.sealed.artifact.criteria.slice(0, 2) });
  assert.deepEqual(checkArtifactIntegrity(swapped), { ok: true });
  assert.equal(checkSpecIntegrity(swapped.artifact, specHashOf).ok, false);
});

/*
 * The whole set settling is what makes `verified` reachable at all, so
 * it is worth asserting directly rather than only through the replay.
 */
test('a report that states every checked field reaches verified', async () => {
  const run = await runFixture(complete);
  const notPassed = run.result.checks.filter((c) => c.outcome !== 'passed');
  assert.deepEqual(
    notPassed.map((c) => `${c.id}:${c.outcome}`),
    [],
    'a fully-stated correct report did not pass every check',
  );
  assert.equal(run.result.state, 'verified');
  assert.match(run.result.headline, /All 7 checks matched/);
});

/*
 * Zero debt is a real position, and its figures still have to agree.
 *
 * `verifyVenusReport` returned from its no-debt branch before the dollar
 * rows were built, so a report correctly stating an account had borrowed
 * nothing had its collateral recorded and never checked. Two criteria a
 * buyer had been shown could not be settled on any zero-debt position,
 * and a run that cannot settle them can never reach verified however
 * right the report is. Nothing unchecked was passed — the gap was that
 * nothing could be checked.
 *
 * Found by the independent fixtures work, against the core it does not
 * own, which is the point of having one.
 */
function zeroDebtReport(overrides: Record<string, unknown> = {}): string {
  const manifest = JSON.parse(REAL_REPORT) as { response: { content: string } };
  const body = JSON.parse(manifest.response.content) as Record<string, unknown>;
  manifest.response.content = JSON.stringify({
    ...body,
    health_factor: null,
    debt_usd: 0,
    collateral_usd: 376368.41,
    chain_id: 56,
    liquidatable: false,
    ...overrides,
  });
  return JSON.stringify(manifest);
}

const ZERO_DEBT_FACTS = fixtureFacts({
  account: ACCOUNT,
  block: BLOCK,
  blockTime: '2026-10-15T11:59:31.000Z',
  healthFactor: null,
  borrowLimitRatio: null,
  liquidatable: false,
  debtUsd: 0,
  collateralUsd: 376368.41,
});

test('a correct zero-debt report settles every criterion', async () => {
  const run = await runFixture({
    id: 'zero-debt',
    why: 'no borrow, so no health factor',
    report: zeroDebtReport(),
    account: ACCOUNT,
    evidence: { available: true, facts: ZERO_DEBT_FACTS },
  });
  const unsettled = run.result.checks.filter((c) => c.outcome !== 'passed');
  assert.deepEqual(
    unsettled.map((c) => `${c.id}:${c.outcome}`),
    [],
    'a correct zero-debt report left criteria unsettled, so it could never be verified',
  );
  assert.equal(run.result.state, 'verified');
});

/* And the dollars are still judged on a zero-debt position, so a wrong
   collateral figure is caught rather than excused by the absent ratio. */
test('a zero-debt report with the wrong collateral still fails', async () => {
  const run = await runFixture({
    id: 'zero-debt-wrong-collateral',
    why: 'no borrow, wrong collateral',
    report: zeroDebtReport({ collateral_usd: 1_000_000 }),
    account: ACCOUNT,
    evidence: { available: true, facts: ZERO_DEBT_FACTS },
  });
  assert.equal(run.result.checks.find((c) => c.id === 'position.collateral_usd')?.outcome, 'failed');
  assert.equal(run.result.state, 'mismatch');
});
