import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

/* ---------- remediation ---------- */

import { remediationFor, remediationForRun, REMEDIATION_PREAMBLE } from '../src/lib/proofrun/remediation';

/*
 * The live case this was built for: mainnet job 56/57071, a delivered
 * report from an agent that answers every probe, refused because it never
 * says which block it read. Nothing is wrong with the figures; there is
 * no way to check them, and the fix is one field.
 */
test('the commonest dead end tells the builder what to add', () => {
  const fix = remediationForRun({
    state: 'unverifiable',
    checks: [],
    headline: 'Could not verify',
    detail: 'The report does not say which block it read. Without that, a check could only compare it with the position now.',
  });
  assert.ok(fix, 'the commonest unverifiable case offers no fix at all');
  assert.equal(fix.owner, 'builder');
  assert.match(fix.fix, /block number/i);
});

/*
 * Whose fix it is, is the point of the module. Telling a builder to
 * correct a pruned node would be telling them to fix something that is
 * not theirs — and a builder who "fixed" it by guessing a block would
 * turn a checkable report into a wrong one.
 */
test('a limitation on Pokter’s side is not pinned on the builder', () => {
  const fix = remediationFor({ outcome: 'not-verified', limitation: 'The node no longer keeps that block.' });
  assert.equal(fix?.owner, 'pokter');
  assert.match(fix?.fix ?? '', /Nothing for the builder to change/);
});

test('a brief that names no account is the buyer’s to fix', () => {
  const fix = remediationFor({ outcome: 'not-verified', limitation: 'The brief names no wallet address.' });
  assert.equal(fix?.owner, 'buyer');
});

/*
 * A failed check already has its answer. Offering a fix for one would
 * read as advice on how to make a wrong report pass, which is the
 * opposite of what this feature is for.
 */
test('no fix is offered for a check that ran and failed', () => {
  assert.equal(remediationFor({ outcome: 'failed', limitation: 'The report does not say which block it read.' }), null);
  assert.equal(remediationFor({ outcome: 'passed' }), null);
  assert.equal(remediationForRun({ state: 'mismatch', checks: [], headline: 'Differs' }), null);
  assert.equal(remediationForRun({ state: 'verified', checks: [], headline: 'Matches' }), null);
});

/* Not-verified must never be introduced as a finding that the report is wrong. */
test('the preamble does not accuse a report it could not check', () => {
  assert.match(REMEDIATION_PREAMBLE.builder, /not a finding that it is wrong/i);
  for (const line of Object.values(REMEDIATION_PREAMBLE)) {
    assert.doesNotMatch(line, /incorrect|wrong report|failed/i);
  }
});

/*
 * Remediation matches on the checker's own sentences, so a reword in
 * `venus-report-check.ts` would silently stop offering the fix for the
 * commonest dead end — the failure would be an absence, which is the
 * hardest kind to notice. This holds the checker to the phrasings the
 * patterns depend on, and names the file to edit when one must change.
 */
test('the checker still says what remediation matches on', () => {
  const checker = readFileSync(new URL('../src/lib/delivery/venus-report-check.ts', import.meta.url), 'utf8');
  for (const phrase of [
    'does not say which block it read',
    'Stated to ${claim.statedDecimals} decimal place',
  ]) {
    assert.ok(
      checker.includes(phrase),
      `the checker no longer says “${phrase}”, so src/lib/proofrun/remediation.ts stopped matching it`,
    );
  }
  /* And the live sentence, as production returned it for job 56/57071. */
  const live = 'The report does not say which block it read. Without that, a check could only compare it with the position now — and a position moves, so the result would describe the delay rather than the report.';
  const fix = remediationForRun({ state: 'unverifiable', checks: [], headline: 'Could not verify', detail: live });
  assert.equal(fix?.owner, 'builder', 'the sentence production actually returns is not matched');
});

/* ---------- scenarios ---------- */

import { KIND_DISCLOSURE, PROOFRUN_LIMITATIONS, SCENARIOS, scenarioById } from '../src/lib/proofrun/scenarios';

/*
 * The two claims this feature is most able to make by accident: that a
 * written-down position existed on chain, and that running it contacted
 * the agent. Both are prevented in the type rather than in a label
 * somebody remembers to render — a fixture has no block to pin and
 * cannot carry one.
 */
test('a fixture cannot carry on-chain evidence, and a replay must', () => {
  for (const scenario of SCENARIOS) {
    if (scenario.kind === 'fixture') {
      assert.ok(!('blockNumber' in scenario), `${scenario.id} is synthetic but carries a block number`);
      assert.ok(!('account' in scenario), `${scenario.id} is synthetic but names an on-chain account`);
      assert.ok(['fixture', 'simulation'].includes(scenario.provenance), `${scenario.id} is synthetic but claims ${scenario.provenance} provenance`);
    } else {
      assert.match(scenario.blockNumber, /^\d+$/, `${scenario.id} is a replay without a block to re-read`);
      assert.ok(['customer', 'sponsored'].includes(scenario.provenance));
    }
  }
});

test('the disclosure for a fixture denies both claims in words', () => {
  assert.match(KIND_DISCLOSURE.fixture, /never existed on chain/i);
  assert.match(KIND_DISCLOSURE.fixture, /contacts no provider/i);
  assert.match(KIND_DISCLOSURE.replay, /existed on BNB Chain at the block named/i);
});

/* Every scenario says what passing it proves, so a green row cannot be
   read as a broader endorsement than it is. */
test('every scenario names the behaviour it exercises', () => {
  assert.ok(SCENARIOS.length > 0);
  for (const scenario of SCENARIOS) {
    assert.ok(scenario.exercises.length > 30, `${scenario.id} does not say what it exercises`);
    assert.ok(scenario.purpose.length > 30, `${scenario.id} does not say what it is for`);
  }
  assert.equal(scenarioById('zero-debt')?.kind, 'fixture');
  assert.equal(scenarioById('nope'), null);
});

/*
 * The positioning is "see where it fails", and the forbidden claims are
 * the ones a verification feature drifts into: a guarantee, a first, or a
 * verdict on advice. These assert the limitations carry the opposite.
 */
test('the limitations refuse the claims this feature could drift into', () => {
  const all = PROOFRUN_LIMITATIONS.join(' ');
  assert.match(all, /not a statement about the agent’s other answers/i);
  assert.match(all, /Whether a position is wise.*outside what any of this can settle/is);
  assert.match(all, /Only Venus Core Pool on BNB Smart Chain is supported/i);
  assert.match(all, /not verified rather than re-read at the head/i);
  for (const forbidden of [/world.s first/i, /guarantee/i, /safe to invest/i, /audited and approved/i, /certifi/i]) {
    assert.doesNotMatch(all, forbidden, 'the limitations make a claim they exist to refuse');
  }
});

/*
 * A row must not claim agreement the spec beside it denies.
 *
 * Found by running the real route: the artifact for job 56/57004 carried
 * `binding: pokter-asserted` — the agent never agreed to these criteria —
 * above seven rows each reading "This criterion was agreed but nothing
 * settled it". The verdict was right and the sentence above it was wrong,
 * which is the exact failure this feature exists to catch, reproduced
 * inside it. Neither the unit tests nor the type checker could see it;
 * fetching the artifact could.
 */
test('an unsettled criterion does not claim the agent agreed to it', () => {
  const unsettled = (binding: 'signed-terms' | 'pokter-asserted') =>
    checksFromVerification({
      verification: verification({ values: [] }),
      criteria: venusHealthCriteria(),
      binding: { kind: binding },
    }).find((c) => c.id === 'hf.value')?.limitation ?? '';

  assert.match(unsettled('pokter-asserted'), /not agreed by the agent/i, 'Pokter-recorded criteria were described as agreed');
  assert.doesNotMatch(unsettled('pokter-asserted'), /^Agreed with the agent/i);
  assert.match(unsettled('signed-terms'), /Agreed with the agent/i, 'criteria the agent signed were not described as agreed');
});

/* ---------- the consolidated binding rule ---------- */

import { isSpecLine } from '../src/lib/proofrun/acceptance';
import { sanitizeForClaim } from '../src/lib/erc8183/negotiation';

/*
 * Cases Agent 1's `criteriaInSignedTerms` covered and `bindingFor` did
 * not, moved here as the two rules consolidate into one. One of them was
 * a latent defect in mine.
 *
 * `negotiationContent` maps `success_criteria` through `sanitizeForClaim`
 * before hashing, so the strings an agent signs are the sanitised ones.
 * Comparing a raw line against them works for today's spec prefix only
 * because it carries no bracket and no control character — a property of
 * the current string, not a guarantee. A prefix that grew one would make
 * every binding silently fall back to `pokter-asserted`, which fails in
 * the safe direction and would still be wrong.
 */
test('binding compares after the same sanitising the hash applies', () => {
  const spec = venusAcceptanceSpec({ deployment: DEPLOYMENT, chainId: 56 });
  const line = `${SPEC_TERM_PREFIX}${spec.specHash}`;

  /* What the agent actually signed is the sanitised form. */
  assert.equal(
    bindingFor({ specHash: spec.specHash, termsBound: true, signedCriteria: [sanitizeForClaim(line)] }).kind,
    'signed-terms',
    'a correctly signed criterion was not recognised after sanitising',
  );

  /* And a control character in the signed copy must not defeat the match,
     since the hash was taken over the sanitised text either way. */
  assert.equal(
    bindingFor({ specHash: spec.specHash, termsBound: true, signedCriteria: [`${line}\u0007`] }).kind,
    'signed-terms',
  );
});

/*
 * The weaker rule, for a caller that asked for criteria without going
 * through `criteriaForTerms`. There is no hash to match, so the only
 * question left is whether every string sent came back signed.
 */
test('without a spec line, every string sent must be in the signed terms', () => {
  const sent = ['deliver a health factor', 'name the block'];
  assert.equal(
    bindingFor({ specHash: '0x'.padEnd(66, '0'), termsBound: true, signedCriteria: sent, sentCriteria: sent }).kind,
    'signed-terms',
  );
  assert.equal(
    bindingFor({ specHash: '0x'.padEnd(66, '0'), termsBound: true, signedCriteria: [sent[0]], sentCriteria: sent }).kind,
    'pokter-asserted',
    'a criterion the agent did not sign was treated as agreed',
  );
});

/*
 * A spec line of another version is still a spec line, so the strong rule
 * applies and the weaker every-string rule must not rescue it. It will
 * not match the current hash, so the answer is `pokter-asserted` —
 * refused for the right reason rather than accepted for the wrong one.
 */
test('a spec line from another version does not fall back to the prose rule', () => {
  const other = `pokter-proofrun/2 spec=0x${'a'.repeat(64)}`;
  assert.ok(isSpecLine(other));
  assert.equal(
    bindingFor({ specHash: `0x${'b'.repeat(64)}`, termsBound: true, signedCriteria: [other], sentCriteria: [other] }).kind,
    'pokter-asserted',
  );
});

/* Nothing sent is not agreement, and never reaches signed-terms. */
test('no criteria at all is never signed-terms', () => {
  assert.equal(bindingFor({ specHash: `0x${'c'.repeat(64)}`, termsBound: true, signedCriteria: [], sentCriteria: [] }).kind, 'pokter-asserted');
  assert.equal(bindingFor({ specHash: `0x${'c'.repeat(64)}`, termsBound: true, signedCriteria: null }).kind, 'pokter-asserted');
});

/* ---------- the tolerance shown is the tolerance applied ---------- */

/*
 * `hfTolerance` and `usdTolerance` allow the larger of a fixed floor and
 * a proportion of the figure, so the criterion's `0.005` is the floor and
 * never the allowance at a given value. Showing the floor beside a pass
 * granted at ±0.0082 invites a reader to conclude the check is broken,
 * and it understates what an agent is held to in criteria it signs.
 */
test('the band shown is the band the checker applied, not the floor', () => {
  const checks = checksFromVerification({
    verification: verification({
      values: [
        { label: 'Health factor', reported: '1.6430', checked: '1.6432', agrees: true },
        { label: 'Debt (USD)', reported: '$210,500', checked: '$210,500.07', agrees: true },
      ],
    }),
  });

  /* 1.6432 × 0.005 = 0.008216, which beats the 0.005 floor. */
  assert.equal(checks.find((c) => c.id === 'hf.value')?.tolerance, '±0.008216');

  /* $210,500.07 × 1% = $2,105.00, which beats the $1 floor. */
  assert.equal(checks.find((c) => c.id === 'position.debt_usd')?.tolerance, '±$2105.00');
});

test('a small figure falls back to the floor rather than below it', () => {
  const checks = checksFromVerification({
    verification: verification({
      values: [{ label: 'Health factor', reported: '0.5', checked: '0.5', agrees: true }],
    }),
  });
  /* 0.5 × 0.005 = 0.0025, under the floor, so the floor applies. */
  assert.equal(checks.find((c) => c.id === 'hf.value')?.tolerance, '±0.005');
});

/* Where no figure parses, the rule is stated rather than a band invented
   or the tolerance dropped — "no tolerance" would read as exact. */
test('an unparseable figure states the rule instead of a number', () => {
  const checks = checksFromVerification({
    verification: verification({ values: [] }),
    criteria: venusHealthCriteria(),
  });
  assert.match(checks.find((c) => c.id === 'hf.value')?.tolerance ?? '', /larger of/);
  assert.match(checks.find((c) => c.id === 'position.debt_usd')?.tolerance ?? '', /larger of/);
});

/* The criteria an agent signs must describe the rule it is held to. */
test('the signed criteria state the real tolerance rule', () => {
  const byId = new Map(venusHealthCriteria().map((c) => [c.id, c.label]));
  assert.match(byId.get('hf.value') ?? '', /larger of ±0\.005 and 0\.5%/);
  assert.match(byId.get('position.debt_usd') ?? '', /larger of ±\$1 and 1%/);
  assert.match(byId.get('position.collateral_usd') ?? '', /larger of ±\$1 and 1%/);
});
