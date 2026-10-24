import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bindingFor,
  criteriaForTerms,
  MAX_TERM_LENGTH,
  MAX_TERM_STRINGS,
  specHashOf,
  venusAcceptanceSpec,
  venusHealthCriteria,
} from '../src/lib/proofrun/acceptance';
import {
  buildArtifact,
  checkArtifactIntegrity,
  checkSpecIntegrity,
  compareRuns,
  hashArtifact,
  sealArtifact,
} from '../src/lib/proofrun/artifact';
import { checksFromVerification, criterionIdForLabel, headlineFor, KNOWN_CHECK_LABELS, stateFromChecks } from '../src/lib/proofrun/checks';
import { SPEC_TERM_PREFIX } from '../src/lib/proofrun/versions';
import type { CheckResult } from '../src/lib/shared/contracts';
import type { VenusReportVerification } from '../src/lib/delivery/venus-report-check';

const DEPLOYMENT = '0xfD36E2c2a6789Db23113685031d7F16329158384' as const;

function verification(overrides: Partial<VenusReportVerification> = {}): VenusReportVerification {
  return {
    verdict: 'matches',
    headline: 'Matches checked facts',
    detail: 'detail',
    block: '51000000',
    blockTime: '2026-10-24T00:00:00.000Z',
    values: [],
    evidence: ['Venus Comptroller at block 51000000'],
    method: ['recomputed'],
    tolerance: ['±0.005'],
    limitations: [],
    ...overrides,
  };
}

function check(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    id: 'hf.value',
    label: 'health factor',
    outcome: 'passed',
    expected: '1.48',
    observed: '1.48',
    source: { block: '51000000', hash: '0xabc' },
    tolerance: '±0.005',
    ...overrides,
  };
}

/* ---------- the three outcomes ---------- */

/*
 * The rule the whole feature rests on.
 *
 * `agrees: null` is the checker declining to compare — a figure stated to
 * too few decimals, a chain it could not resolve. Reading that as
 * agreement would turn "nobody checked" into "it was right", which is the
 * exact claim ProofRun exists to refuse. It has to be not-verified, and
 * it must never be passed.
 */
test('a comparison that did not happen is never a pass', () => {
  const checks = checksFromVerification({
    verification: verification({
      values: [{ label: 'Health factor', reported: '1.5', checked: '1.48', agrees: null, note: 'Stated to 1 decimal place.' }],
    }),
  });
  const hf = checks.find((c) => c.id === 'hf.value');
  assert.ok(hf, 'the health factor check is missing entirely');
  assert.equal(hf.outcome, 'not-verified', 'an uncompared figure was reported as a pass');
  assert.match(hf.limitation ?? '', /decimal/, 'the reason a check was not verified must travel with it');
});

test('agreement and contradiction map to passed and failed', () => {
  const checks = checksFromVerification({
    verification: verification({
      values: [
        { label: 'Health factor', reported: '1.48', checked: '1.48', agrees: true },
        { label: 'Liquidatable', reported: 'yes', checked: 'no', agrees: false },
      ],
    }),
  });
  assert.equal(checks.find((c) => c.id === 'hf.value')?.outcome, 'passed');
  assert.equal(checks.find((c) => c.id === 'hf.liquidatable')?.outcome, 'failed');
});

/*
 * A criterion that was agreed and then settled by nothing must appear.
 *
 * Dropping it would read as satisfied to anyone counting rows — five
 * criteria agreed, three rows shown, and a reader concludes the other two
 * were fine. That is the same defect as marking it passed, arrived at by
 * omission instead of assertion.
 */
test('every agreed criterion appears, even when nothing settled it', () => {
  const criteria = venusHealthCriteria();
  const checks = checksFromVerification({
    verification: verification({ values: [{ label: 'Health factor', reported: '1.48', checked: '1.48', agrees: true }] }),
    criteria,
  });
  for (const criterion of criteria) {
    const row = checks.find((c) => c.id === criterion.id);
    assert.ok(row, `criterion ${criterion.id} vanished from the results`);
  }
  const untouched = checks.find((c) => c.id === 'position.debt_usd');
  assert.equal(untouched?.outcome, 'not-verified');
  assert.match(untouched?.limitation ?? '', /nothing in the delivery or the chain reading settled it/);
});

/*
 * A label the mapping does not know still reaches the buyer.
 *
 * Losing a comparison the checker actually made would under-report a
 * failure, which is the one direction this must never err in. The row is
 * kept with its own prose and flagged as unmapped.
 */
test('a comparison under an unknown label is kept, not dropped', () => {
  const checks = checksFromVerification({
    verification: verification({ values: [{ label: 'Something New', reported: 'a', checked: 'b', agrees: false }] }),
  });
  const row = checks.find((c) => c.id.startsWith('unmapped.'));
  assert.ok(row, 'an unmapped comparison was dropped instead of surfaced');
  assert.equal(row.outcome, 'failed', 'an unmapped failure must still read as a failure');
  assert.match(row.limitation ?? '', /does not map to a named criterion/);
});

/*
 * Guards the fragile half of the mapping. `checksFromVerification` matches
 * the checker's prose labels, so a reworded label in `venus-report-check`
 * would silently start producing `unmapped.*` ids and break every replay
 * comparing against a stored receipt. This fails when that happens.
 */
test('the labels the checker emits are the labels the mapping knows', () => {
  for (const label of ['Account', 'Chain', 'Health factor', 'Liquidatable', 'Debt (USD)', 'Collateral (USD)']) {
    assert.ok(criterionIdForLabel(label), `the checker emits “${label}” and the mapping does not know it`);
  }
  assert.equal(KNOWN_CHECK_LABELS.length, 6);
});

/* ---------- the summary cannot contradict the detail ---------- */

test('nothing checked is unverifiable, never verified', () => {
  assert.equal(stateFromChecks([]), 'unverifiable', 'an empty result set was reported as verified');
  assert.match(headlineFor([]), /Nothing was checked/);
});

test('one failure makes the summary a mismatch however many passed', () => {
  assert.equal(stateFromChecks([check(), check({ id: 'b' }), check({ id: 'c', outcome: 'failed' })]), 'mismatch');
});

test('one not-verified check prevents a verified summary', () => {
  assert.equal(stateFromChecks([check(), check({ id: 'b', outcome: 'not-verified' })]), 'unverifiable');
  assert.equal(stateFromChecks([check(), check({ id: 'b' })]), 'verified');
});

/* ---------- binding ---------- */

/*
 * The distinction the mandate is strictest about: a local field must never
 * be shown as a cryptographically agreed condition. `bindingFor` fails
 * closed, so every way of not-quite-agreeing lands on `pokter-asserted`.
 */
test('binding is signed-terms only on an exact hash line in signed terms', () => {
  const spec = venusAcceptanceSpec({ deployment: DEPLOYMENT, chainId: 56 });
  const line = `${SPEC_TERM_PREFIX}${spec.specHash}`;

  assert.equal(
    bindingFor({ specHash: spec.specHash, termsBound: true, signedCriteria: [line] }).kind,
    'signed-terms',
  );

  for (const [why, args] of [
    ['the terms hash does not bind the signature', { termsBound: false, signedCriteria: [line] }],
    ['the agent signed nothing', { termsBound: true, signedCriteria: null }],
    ['the agent signed other criteria', { termsBound: true, signedCriteria: ['hf.value: something'] }],
    ['the hash is only a prefix', { termsBound: true, signedCriteria: [line.slice(0, line.length - 4)] }],
    ['the hash is right under another version prefix', { termsBound: true, signedCriteria: [`pokter-proofrun/2 spec=${spec.specHash}`] }],
  ] as const) {
    assert.equal(
      bindingFor({ specHash: spec.specHash, ...args }).kind,
      'pokter-asserted',
      `binding claimed agreement when ${why}`,
    );
  }
});

test('a spec built from criteria hashes to what it carries', () => {
  const spec = venusAcceptanceSpec({ deployment: DEPLOYMENT, chainId: 56 });
  assert.equal(spec.specHash, specHashOf(spec.criteria));
  assert.equal(spec.binding.kind, 'pokter-asserted', 'a fresh spec must not claim the agent agreed to it');
  assert.equal(spec.subject.deployment, DEPLOYMENT, 'the deployment must be explicit, never implied by the chain id');
});

/* ---------- what the agent is asked to sign ---------- */

test('the signed terms carry the spec hash first and fit the quote route', () => {
  const spec = venusAcceptanceSpec({ deployment: DEPLOYMENT, chainId: 56 });
  const terms = criteriaForTerms(spec);
  assert.equal(terms[0], `${SPEC_TERM_PREFIX}${spec.specHash}`, 'the hash line must come first');
  assert.ok(terms.length <= MAX_TERM_STRINGS, `the quote route accepts ${MAX_TERM_STRINGS} strings, this sent ${terms.length}`);
  for (const line of terms) {
    assert.ok(line.length <= MAX_TERM_LENGTH, `“${line.slice(0, 40)}…” is longer than the route accepts`);
  }
  /* Seven criteria plus the hash line is exactly the budget: a criterion
     added without raising the limit would silently truncate the list. */
  assert.equal(terms.length, spec.criteria.length + 1, 'a criterion was dropped from what the agent signs');
});

/* ---------- the artifact ---------- */

function artifactFor(checks: CheckResult[]) {
  return buildArtifact({
    provenance: 'fixture',
    job: { chainId: 56, jobId: '1' },
    subject: { chainId: 56, protocol: 'venus-core-pool', deployment: DEPLOYMENT, account: '0xabc', blockNumber: '51000000', blockHash: '0xdef' },
    spec: venusAcceptanceSpec({ deployment: DEPLOYMENT, chainId: 56 }),
    deliverableHash: '0x01',
    briefHash: '0x02',
    checks,
    state: stateFromChecks(checks),
    checkedAt: '2026-10-24T00:00:00.000Z',
    evidence: [],
  });
}

test('a sealed artifact verifies, and an edited one does not', () => {
  const sealed = artifactFor([check()]);
  assert.deepEqual(checkArtifactIntegrity(sealed), { ok: true });

  const edited = { ...sealed, artifact: { ...sealed.artifact, checks: [check({ outcome: 'passed', observed: '9.99' })] } };
  const verdict = checkArtifactIntegrity(edited);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.reason, 'tampered');
});

/*
 * The forger who edits both places.
 *
 * Checking a stored hash against itself would pass here, which is why the
 * hash is recomputed from the content instead. Editing the body and the
 * hash to match still fails, because the attacker would need a keccak
 * collision rather than a consistent pair of edits.
 */
test('an artifact whose hash was edited to match its edited body still fails', () => {
  const sealed = artifactFor([check()]);
  const body = { ...sealed.artifact, checks: [check({ observed: 'tampered' })] };
  const consistent = { artifact: body, artifactHash: hashArtifact({ ...body, checkedAt: 'different' }) };
  assert.equal(checkArtifactIntegrity(consistent).ok, false);
});

test('criteria swapped inside an intact artifact fail the spec check', () => {
  const sealed = artifactFor([check()]);
  const swapped = { ...sealed.artifact, criteria: [venusHealthCriteria()[0]] };
  /* Re-seal, so the artifact hash is valid and only the spec hash is wrong:
     an intact receipt describing a different agreement. */
  const resealed = sealArtifact(swapped);
  assert.deepEqual(checkArtifactIntegrity(resealed), { ok: true }, 'the artifact itself should be intact here');
  const verdict = checkSpecIntegrity(resealed.artifact, specHashOf);
  assert.equal(verdict.ok, false, 'criteria that do not hash to the named spec were accepted');
  assert.equal(verdict.ok === false && verdict.reason, 'tampered');
});

/* ---------- replay ---------- */

test('two runs that agree are agreed', () => {
  assert.equal(compareRuns([check()], [check()]).state, 'agreed');
});

/*
 * The mandate's rule, and the one a verifier is most tempted to break:
 * when two runs disagree, neither is believed. Not the stored one because
 * it is stored, and never resolved into a pass.
 */
test('verifiers that disagree are unresolved, never passed', () => {
  const outcome = compareRuns([check({ outcome: 'passed' })], [check({ outcome: 'failed', observed: '2.01' })]);
  assert.equal(outcome.state, 'contradicted');
  assert.notEqual(outcome.state, 'agreed');
  assert.match(outcome.state === 'contradicted' ? outcome.disagreements[0] : '', /receipt says passed, the replay says failed/);
});

test('a check missing from the replay is a disagreement, not a pass', () => {
  const outcome = compareRuns([check()], []);
  assert.equal(outcome.state, 'contradicted');
});

/*
 * Absent evidence on either side is absent evidence. Counting it as
 * agreement is the silent-success case the feature exists to refuse, and
 * it would be the easiest way to make a replay look clean.
 */
test('a check not verified on either side never counts as agreement', () => {
  for (const [sealedOutcome, freshOutcome] of [
    ['not-verified', 'passed'],
    ['passed', 'not-verified'],
    ['not-verified', 'not-verified'],
  ] as const) {
    const outcome = compareRuns([check({ outcome: sealedOutcome })], [check({ outcome: freshOutcome })]);
    assert.equal(outcome.state, 'not-verified', `${sealedOutcome} against ${freshOutcome} was treated as agreement`);
  }
});

test('the artifact states that its hash is not a correctness claim', () => {
  const sealed = artifactFor([check()]);
  assert.ok(
    sealed.artifact.limitations.some((line) => /says nothing about whether the figures are correct/i.test(line)),
    'the artifact must carry its own limitation about what the hash proves',
  );
  assert.ok(
    sealed.artifact.limitations.some((line) => /unresolved rather than as a pass/i.test(line)),
    'the artifact must say a disagreeing replay is unresolved',
  );
});

test('an artifact says whether it came from a fixture or from customer work', () => {
  assert.equal(artifactFor([check()]).artifact.provenance, 'fixture');
});
