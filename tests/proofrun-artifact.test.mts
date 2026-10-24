import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { keccak256, stringToBytes } from 'viem';

import { VENUS_COMPTROLLER } from '../src/lib/assay/venus';
import { readVenusReportClaim, venusSubjectFromBrief, verifyVenusReport } from '../src/lib/delivery/venus-report-check';
import { bindingFor, criteriaForTerms, specHashOf, venusAcceptanceSpec, venusHealthCriteria } from '../src/lib/proofrun/acceptance';
import {
  REPLAY_LIMITATIONS,
  checkArtifactIntegrity,
  checkSpecIntegrity,
  compareRuns,
  hashArtifact,
  sealArtifact,
  type ProofRunArtifact,
  type SealedArtifact,
} from '../src/lib/proofrun/artifact';
import { KNOWN_CHECK_LABELS, checksFromVerification, stateFromChecks } from '../src/lib/proofrun/checks';
import { ARTIFACT_VERSION, SPEC_TERM_PREFIX } from '../src/lib/proofrun/versions';
import type { CheckResult } from '../src/lib/shared/contracts';
import {
  FIXTURE_FILES,
  buildRun,
  evidenceOf,
  factsOf,
  loadFixture,
  manifestOf,
  aDifferentCriteriaSet,
  subjectOf,
  type ProofRunFixture,
} from './fixtures/proofrun/support.mjs';

/**
 * The ProofRun route, end to end, one fixture per case.
 *
 * Criteria agreed and signed, a job briefed, a file delivered, the figures
 * recomputed from Venus at the block the report names, named checks, a sealed
 * receipt. Every step is the product's own function; nothing is hand-written
 * into a receipt, so a receipt built here is a receipt the route would build.
 * The replay of it as a separate process is `proofrun-verify-cli.test.mts`.
 *
 * Two things these tests are written to catch, because the repository has
 * shipped both before:
 *
 *  - a test that passes whichever way the code goes. Every refusal below is
 *    paired with the control that must still pass, so a guard that stopped
 *    guarding would show up as the control failing or the refusal passing.
 *  - a test that picks the one input value which hides the defect. The
 *    tolerances, the precision band and the decimals are asserted as
 *    arithmetic against the fixture's own figures rather than as magic
 *    numbers, so a changed tolerance cannot quietly keep the test green.
 */

const fixtures = FIXTURE_FILES.map(loadFixture);
const byCase = new Map(fixtures.map((fixture) => [fixture.case, fixture]));
function fixture(name: string): ProofRunFixture {
  const found = byCase.get(name);
  if (!found) throw new Error(`no fixture for ${name}`);
  return found;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/* ---------- 1. the fixtures say what they are ---------- */

test('1. every fixture is labelled a fixture, says what it proves, and is attributed to nobody', () => {
  assert.equal(fixtures.length, 10, 'one fixture per case in the mandate');
  const cases = new Set(fixtures.map((f) => f.case));
  assert.equal(cases.size, 10, 'no two fixtures describe the same case');

  for (const f of fixtures) {
    assert.equal(f.fixture, true, f.case);
    assert.equal(f.provenance, 'fixture', `${f.case}: provenance must be 'fixture'`);
    assert.ok(f._why.length > 40, `${f.case}: _why has to say what the fixture proves`);
    assert.ok(f._why.length < 400, `${f.case}: _why is meant to be short`);
    assert.match(f.attribution, /synthetic/i, f.case);
    /*
     * No fixture may read as somebody's work. Pokter lists real agents by
     * name and a fixture carrying one would travel into a receipt, a page or
     * a screenshot as that agent's delivery — which is a false record about
     * a real builder, the one thing a test fixture must never become.
     */
    const text = JSON.stringify(f);
    for (const name of ['brinkwatch', 'nagi', 'halong', 'brain on bnb', 'stockroom', 'healthmon', 'vitals', 'ivl']) {
      assert.doesNotMatch(text.toLowerCase(), new RegExp(name), `${f.case} names ${name}`);
    }
    assert.doesNotMatch(text, /answered_by/, `${f.case} claims an author`);
  }
});

test('1b. a fixture derived from real chain state says which block, and a synthetic one never implies a chain', () => {
  const real = fixtures.filter((f) => f.chain?.real === true);
  const synthetic = fixtures.filter((f) => f.chain?.real === false);
  assert.ok(real.length >= 6 && synthetic.length >= 1, 'both kinds are present');

  for (const f of real) {
    // The block is named, and named as the block the state was read at.
    assert.match(f.chain!.note, /block 129,170,001/, f.case);
    assert.match(f.chain!.note, /real/i, f.case);
    assert.match(f.chain!.note, /synthetic/i, `${f.case}: the note must say the report is not real`);
    assert.equal(f.subject!.blockNumber, '129170001', f.case);
    // The block identity is the real one, agreed by two independent nodes.
    assert.equal(f.subject!.blockHash, '0x0fb0ff45c30e9eff4119ff9bef93dddff826964d97680724b0263b58a3780ac3', f.case);
  }
  for (const f of synthetic) {
    assert.match(f.chain!.note, /no part of this chain state is real/i, f.case);
    // A synthetic state must not sit on a block number a reader could mistake
    // for a real one: BNB Chain's head is around 129 million.
    assert.ok(BigInt(f.subject!.blockNumber) > 500_000_000n, `${f.case}: ${f.subject!.blockNumber} could pass for a real block`);
    assert.doesNotMatch(f.subject!.blockHash ?? '', /^0x0fb0ff45/, f.case);
  }
});

/* ---------- 2. the criteria are agreed before the job, not after the answer ---------- */

test('2. the criteria bind through the agent’s own signature, and anything short of the exact hash does not', () => {
  const spec = venusAcceptanceSpec({ deployment: VENUS_COMPTROLLER, chainId: 56 });
  assert.equal(spec.specHash, specHashOf(spec.criteria), 'the hash is a function of the criteria');
  assert.equal(spec.binding.kind, 'pokter-asserted', 'a fresh spec is only ever Pokter’s own record');

  const terms = criteriaForTerms(spec);
  assert.equal(terms[0], `${SPEC_TERM_PREFIX}${spec.specHash}`, 'the hash is the first thing the agent signs');
  assert.ok(terms.length <= 8 && terms.every((line) => line.length <= 200), 'inside the quote route’s own limit');

  const signed = bindingFor({ specHash: spec.specHash, termsBound: true, signedCriteria: terms });
  assert.equal(signed.kind, 'signed-terms', 'the control: the exact hash in signed terms does bind');

  /*
   * Each way of nearly agreeing, which must all fail closed. Without the
   * control above, a `bindingFor` that always returned pokter-asserted would
   * pass every one of these.
   */
  const nearly: Array<[string, Parameters<typeof bindingFor>[0]]> = [
    ['terms not bound to the signature', { specHash: spec.specHash, termsBound: false, signedCriteria: terms }],
    ['nothing signed', { specHash: spec.specHash, termsBound: true, signedCriteria: null }],
    ['the prose without the hash', { specHash: spec.specHash, termsBound: true, signedCriteria: terms.slice(1) }],
    ['a prefix of the hash', { specHash: spec.specHash, termsBound: true, signedCriteria: [`${SPEC_TERM_PREFIX}${spec.specHash.slice(0, 40)}`] }],
    ['the right hash under another version prefix', { specHash: spec.specHash, termsBound: true, signedCriteria: [`pokter-proofrun/0 spec=${spec.specHash}`] }],
    ['a different criteria set’s hash', { specHash: specHashOf(aDifferentCriteriaSet()), termsBound: true, signedCriteria: terms }],
  ];
  for (const [why, input] of nearly) {
    assert.equal(bindingFor(input).kind, 'pokter-asserted', why);
  }
});

test('2b. the subject comes from the brief on chain and never from the report', () => {
  const f = fixture('correct-report');
  const { brief } = buildRun(f);
  const fromBrief = venusSubjectFromBrief(brief);
  assert.ok(fromBrief.ok);
  assert.equal(fromBrief.subject.account.toLowerCase(), f.subject!.account.toLowerCase());

  /*
   * The defect this is the guard for: a report that names its own account can
   * be perfectly correct about a wallet nobody asked about. Held against the
   * brief's subject, a report about another wallet is a disagreement however
   * right its figures are.
   */
  const elsewhere = clone(f);
  elsewhere.report!.account = '0x000000000000000000000000000000000000dead';
  const verdict = verifyVenusReport({
    subject: subjectOf(f),
    manifestText: manifestOf(elsewhere),
    manifestMatchesChain: true,
    claim: readVenusReportClaim(manifestOf(elsewhere)),
    evidence: evidenceOf(f),
  });
  assert.equal(verdict.verdict, 'differs');
  assert.match(verdict.detail, /not about this position/);
});

/* ---------- 3. each case reaches the verdict it declares ---------- */

for (const name of ['correct-report', 'plausible-wrong-report', 'bad-decimals', 'zero-debt', 'stale-oracle', 'unsupported-market', 'pruned-archive', 'mismatched-block-hash'] as const) {
  test(`3. ${name}: the route reaches the verdict and the summary the fixture declares`, () => {
    const f = fixture(name);
    const verification = verifyVenusReport({
      subject: subjectOf(f),
      manifestText: manifestOf(f),
      manifestMatchesChain: true,
      claim: readVenusReportClaim(manifestOf(f)),
      evidence: evidenceOf(f),
    });
    assert.equal(verification.verdict, f.expect.verdict, `${name}: ${verification.detail}`);

    const { sealed } = buildRun(f);
    assert.equal(sealed.artifact.state, f.expect.state, name);
    assert.equal(sealed.artifact.provenance, 'fixture', 'no surface may count a fixture as customer work');
    assert.equal(checkArtifactIntegrity(sealed).ok, true, name);
    assert.equal(checkSpecIntegrity(sealed.artifact, specHashOf).ok, true, name);

    // Every agreed criterion appears, whether or not anything settled it: a
    // criterion silently missing reads as satisfied to anyone counting rows.
    assert.deepEqual(
      [...new Set(sealed.artifact.checks.map((c) => c.id))].sort(),
      venusHealthCriteria().map((c) => c.id).sort(),
      name,
    );
    for (const check of sealed.artifact.checks) {
      if (check.outcome === 'not-verified') assert.ok(check.limitation, `${name}/${check.id}: not-verified without saying why`);
    }
  });
}

test('3b. the refusals are caused by what the fixture says they are, and not by something else', () => {
  /*
   * Each of these is a control: the same report against available state is a
   * match, so the refusal above is attributable to the one thing the fixture
   * changed. Without these, a verifier that refused everything would pass
   * the whole of section 3.
   */
  const control = fixture('correct-report');
  for (const name of ['stale-oracle', 'pruned-archive'] as const) {
    const f = fixture(name);
    assert.deepEqual(f.report, { ...f.report, health_factor: control.report!.health_factor }, `${name} must carry the correct report`);
    const withState = verifyVenusReport({
      subject: subjectOf(f),
      manifestText: manifestOf(f),
      manifestMatchesChain: true,
      claim: readVenusReportClaim(manifestOf(f)),
      evidence: { available: true, facts: factsOf(control) },
    });
    assert.equal(withState.verdict, 'matches', `${name}: the report itself is fine; only the evidence is missing`);
  }

  // The unsupported market: the same figures without the pool field match.
  const market = fixture('unsupported-market');
  const noPool = clone(market);
  delete noPool.report!.pool;
  const asCore = verifyVenusReport({
    subject: subjectOf(market),
    manifestText: manifestOf(noPool),
    manifestMatchesChain: true,
    claim: readVenusReportClaim(manifestOf(noPool)),
    evidence: evidenceOf(market),
  });
  assert.equal(asCore.verdict, 'matches', 'the pool field is what makes it unresolvable');
});

test('3c. the node’s refusals are told apart, in the node’s own words', () => {
  const pruned = fixture('pruned-archive');
  const prunedEvidence = evidenceOf(pruned);
  assert.equal(prunedEvidence.available, false);
  assert.equal(prunedEvidence.available === false && prunedEvidence.code, pruned.chain!.expectRefusalCode);
  assert.equal(prunedEvidence.available === false && prunedEvidence.detail, pruned.chain!.expectRefusalDetail);

  const stale = fixture('stale-oracle');
  const staleEvidence = evidenceOf(stale);
  assert.equal(staleEvidence.available === false && staleEvidence.code, stale.chain!.expectRefusalCode);
  assert.equal(staleEvidence.available === false && staleEvidence.detail, stale.chain!.expectRefusalDetail);

  /*
   * The two codes mean different things to a buyer and must not be swapped:
   * no-history says the node no longer keeps the block, read-failed says the
   * read itself failed and the report is not implicated.
   */
  assert.notEqual(pruned.chain!.expectRefusalCode, stale.chain!.expectRefusalCode);
});

test('3d. nothing is read from the chain for a report that is already decided', async () => {
  const market = fixture('unsupported-market');
  const asked: bigint[] = [];
  const { checkDeliveredVenusReport } = await import('../src/lib/delivery/venus-report-check');
  const verification = await checkDeliveredVenusReport({
    subject: subjectOf(market),
    manifestText: manifestOf(market),
    manifestMatchesChain: true,
    readFactsAt: async (at) => {
      asked.push(at.block);
      return evidenceOf(market);
    },
  });
  assert.equal(verification.verdict, 'unverified');
  assert.equal(asked.length, market.expect.chainReadsBeforeVerdict, 'an undecidable market is settled before any archive request');

  // The control: a report that is not already decided does cause exactly one
  // read, at the block it named and at no other.
  const good = fixture('correct-report');
  const read: Array<{ account: string; block: bigint }> = [];
  const ok = await checkDeliveredVenusReport({
    subject: subjectOf(good),
    manifestText: manifestOf(good),
    manifestMatchesChain: true,
    readFactsAt: async (at) => {
      read.push(at);
      return evidenceOf(good);
    },
  });
  assert.equal(ok.verdict, 'matches');
  assert.deepEqual(read, [{ account: good.subject!.account, block: BigInt(good.subject!.blockNumber) }]);
});

test('3e. the arithmetic behind the precision and tolerance cases, not the magic numbers', () => {
  const good = fixture('correct-report');
  const facts = factsOf(good);
  const chainHf = facts.healthFactor as number;

  // bad-decimals: outside the tolerance, inside the band the report's own
  // rounding claims. Both halves are required or the guard is an escape hatch.
  const coarse = fixture('bad-decimals').report!.health_factor as number;
  const allowance = Math.max(0.005, 0.005 * chainHf);
  assert.ok(Math.abs(coarse - chainHf) > allowance, 'a coarse figure inside the tolerance would be an ordinary match');
  assert.ok(Math.abs(coarse - chainHf) <= 0.5 * 10 ** -1, 'and it has to be inside its own ±0.05 to be unresolvable');
  assert.equal(readVenusReportClaim(manifestOf(fixture('bad-decimals'))).ok && (readVenusReportClaim(manifestOf(fixture('bad-decimals'))) as { claim: { statedDecimals: number | null } }).claim.statedDecimals, 1);

  // plausible-wrong-report: stated precisely enough that no rounding excuses
  // it, and far enough from the borrowing-limit ratio to not be that error.
  const wrong = fixture('plausible-wrong-report').report!.health_factor as number;
  assert.equal(String(wrong).split('.')[1].length, 4, 'four places is a precise claim');
  assert.ok(Math.abs(wrong - chainHf) > 0.5 * 10 ** -4);
  assert.ok(Math.abs(wrong - (facts.borrowLimitRatio as number)) > allowance, 'not the collateral-factor ratio either');

  // correct-report: inside the allowance, and the fixture states both USD
  // totals so that the two criteria that depend on them can be settled.
  const right = good.report!.health_factor as number;
  assert.ok(Math.abs(right - chainHf) <= allowance);
  assert.ok(typeof good.report!.debt_usd === 'number' && typeof good.report!.collateral_usd === 'number');
});

test('3f. zero debt: a report that says there is none matches, and one that invents a ratio does not', () => {
  const f = fixture('zero-debt');
  const asDelivered = verifyVenusReport({
    subject: subjectOf(f),
    manifestText: manifestOf(f),
    manifestMatchesChain: true,
    claim: readVenusReportClaim(manifestOf(f)),
    evidence: evidenceOf(f),
  });
  assert.equal(asDelivered.verdict, 'matches');
  assert.equal(asDelivered.values.find((v) => v.label === 'Health factor')?.agrees, true);

  const invented = clone(f);
  invented.report!.health_factor = 1.42;
  const wrong = verifyVenusReport({
    subject: subjectOf(f),
    manifestText: manifestOf(invented),
    manifestMatchesChain: true,
    claim: readVenusReportClaim(manifestOf(invented)),
    evidence: evidenceOf(f),
  });
  assert.equal(wrong.verdict, 'differs');
  assert.match(wrong.detail, /no debt .*so there is no health factor|shows no debt/);

  const liquidatable = clone(f);
  liquidatable.report!.liquidatable = true;
  const both = verifyVenusReport({
    subject: subjectOf(f),
    manifestText: manifestOf(liquidatable),
    manifestMatchesChain: true,
    claim: readVenusReportClaim(manifestOf(liquidatable)),
    evidence: evidenceOf(f),
  });
  assert.equal(both.verdict, 'differs');
  assert.match(both.detail, /nothing to liquidate/);
});

/* ---------- 4. integrity, before anything else ---------- */

test('4. a receipt edited after sealing is refused, and the unedited one is not', () => {
  const declared = fixture('tampered-artifact');
  const base = buildRun(fixture(declared.basedOn!.replace(/^\d+-|\.json$/g, '')));
  assert.equal(checkArtifactIntegrity(base.sealed).ok, true, 'the control: the receipt as sealed is intact');

  for (const edit of declared.edits!) {
    const sealed = clone(base.sealed) as SealedArtifact;
    if (edit.guard === 'checkArtifactIntegrity') {
      const row = sealed.artifact.checks.find((c) => c.id === 'hf.value') as CheckResult;
      const original = row.observed;
      row.observed = String(edit.to);
      if (edit.reseal === 'forged-hash') {
        /*
         * The forger edits the hash too. Recomputing rather than comparing a
         * stored field is what makes this useless: they need a keccak
         * collision, not two consistent edits.
         */
        const forged = hashArtifact(sealed.artifact);
        sealed.artifactHash = `0x${forged.slice(2, 65)}${forged[65] === '0' ? '1' : '0'}`;
      }
      const verdict = checkArtifactIntegrity(sealed);
      assert.equal(verdict.ok, false, edit.name);
      assert.equal(verdict.ok === false && verdict.reason, edit.expect, edit.name);

      // And the edit is the only reason: undo it and the stored hash is right
      // again. Without this the test would pass for a receipt that had rotted.
      row.observed = original;
      if (edit.reseal === 'forged-hash') sealed.artifactHash = base.sealed.artifactHash;
      assert.equal(checkArtifactIntegrity(sealed).ok, true, `${edit.name}: nothing but the edit is wrong`);
    } else {
      /*
       * The criteria are widened and the receipt re-sealed, so the artifact
       * hash is correct and only the spec hash is not. A buyer needs the two
       * told apart: one means the receipt was edited, the other means the
       * criteria in it are not the criteria that were agreed and signed.
       */
      const artifact = clone(base.sealed.artifact) as ProofRunArtifact;
      const criterion = artifact.criteria.find((c) => c.id === 'hf.value');
      assert.ok(criterion, 'hf.value is in the criteria');
      criterion!.check.tolerance = edit.to as number;
      const resealed = sealArtifact(artifact);
      assert.equal(checkArtifactIntegrity(resealed).ok, true, `${edit.name}: the body itself is intact`);
      const spec = checkSpecIntegrity(resealed.artifact, specHashOf);
      assert.equal(spec.ok, false, edit.name);
      assert.equal(spec.ok === false && spec.reason, edit.expect, edit.name);
      assert.match(spec.ok === false ? spec.detail : '', /criteria do not hash/i);
    }
  }
});

test('4b. anything that is not a sealed artifact is unreadable rather than a pass', () => {
  for (const [why, value] of [
    ['null', null],
    ['an array', []],
    ['a number', 7],
    ['no body', { artifactHash: `0x${'ab'.repeat(32)}` }],
    ['no hash', { artifact: {} }],
    ['a hash that is not one', { artifact: {}, artifactHash: 'nope' }],
  ] as Array<[string, unknown]>) {
    const verdict = checkArtifactIntegrity(value);
    assert.equal(verdict.ok, false, why);
    assert.equal(verdict.ok === false && verdict.reason, 'unreadable', why);
  }
});

/* ---------- 5. the replay's three outcomes, and the fourth it must not have ---------- */

test('5. compareRuns: agreement, disagreement, and absence of evidence told apart', () => {
  const row = (id: string, outcome: CheckResult['outcome'], observed = 'x'): CheckResult => ({
    id,
    label: id,
    outcome,
    expected: 'y',
    observed,
    source: { block: '1', hash: null },
    tolerance: null,
    ...(outcome === 'not-verified' ? { limitation: 'nothing settled it' } : {}),
  });

  assert.equal(compareRuns([row('a', 'passed')], [row('a', 'passed')]).state, 'agreed');
  assert.equal(compareRuns([row('a', 'failed')], [row('a', 'failed')]).state, 'agreed', 'agreeing that a report is wrong is still agreement');

  const contradicted = compareRuns([row('a', 'passed')], [row('a', 'failed', 'z')]);
  assert.equal(contradicted.state, 'contradicted');
  assert.equal(contradicted.state === 'contradicted' && contradicted.disagreements.length, 1);

  /*
   * The case the whole feature exists for. A check nothing settled, on either
   * side, is the absence of evidence — never agreement. Both directions,
   * because only testing one would leave the other free to pass.
   */
  assert.equal(compareRuns([row('a', 'not-verified')], [row('a', 'passed')]).state, 'not-verified');
  assert.equal(compareRuns([row('a', 'passed')], [row('a', 'not-verified')]).state, 'not-verified');
  assert.equal(compareRuns([row('a', 'not-verified')], [row('a', 'not-verified')]).state, 'not-verified');
  // A check the replay did not produce at all is not a pass either.
  assert.equal(compareRuns([row('a', 'passed')], []).state, 'contradicted');

  // A disagreement is never resolved into agreement by the rest passing.
  const mixed = compareRuns([row('a', 'passed'), row('b', 'passed')], [row('a', 'passed'), row('b', 'failed', 'z')]);
  assert.equal(mixed.state, 'contradicted');
});

test('5b. stateFromChecks never calls nothing-checked a pass', () => {
  const row = (outcome: CheckResult['outcome']): CheckResult => ({ id: outcome, label: outcome, outcome, expected: '-', observed: '-', source: { block: null, hash: null }, tolerance: null });
  assert.equal(stateFromChecks([]), 'unverifiable', 'nothing checked is not the same as nothing wrong');
  assert.equal(stateFromChecks([row('passed')]), 'verified');
  assert.equal(stateFromChecks([row('passed'), row('not-verified')]), 'unverifiable');
  assert.equal(stateFromChecks([row('passed'), row('failed')]), 'mismatch');
  // A failure outranks a gap: a receipt with both must not read as merely unchecked.
  assert.equal(stateFromChecks([row('failed'), row('not-verified')]), 'mismatch');
});

test('5c. a replay of a correct receipt agrees, and a replay against different figures is unresolved', () => {
  const f = fixture('correct-report');
  const { sealed } = buildRun(f);
  assert.equal(sealed.artifact.state, f.expect.state);

  // The same run again: agreement.
  const again = buildRun(f);
  assert.equal(compareRuns(sealed.artifact.checks, again.sealed.artifact.checks).state, 'agreed');

  /*
   * A node that reads a different health factor at the same block. One of the
   * two readings is wrong and nothing here can tell which, so it is reported
   * as unresolved — not as a pass because the receipt says so, and not as a
   * failure of the report.
   */
  const claim = readVenusReportClaim(manifestOf(f));
  const disagreeing = verifyVenusReport({
    subject: subjectOf(f),
    manifestText: manifestOf(f),
    manifestMatchesChain: true,
    claim,
    evidence: { available: true, facts: { ...factsOf(f), healthFactor: 1.4012 } },
  });
  const fresh = checksFromVerification({
    verification: disagreeing,
    criteria: sealed.artifact.criteria,
    blockHash: f.subject!.blockHash,
    chainClaim: claim.ok ? claim.claim.chain : undefined,
    binding: sealed.artifact.binding,
  });
  const outcome = compareRuns(sealed.artifact.checks, fresh);
  assert.equal(outcome.state, 'contradicted');
  assert.ok(outcome.state === 'contradicted' && outcome.disagreements.some((line) => line.startsWith('hf.value:')));
});

/* ---------- 6. what the shipped criteria set can and cannot settle ---------- */

test('6. the shipped criteria set reaches “verified”, and the two inferred rows are inferred and not assumed', () => {
  /*
   * Both of these criteria used to be unsettleable. The checker emits an
   * Account or Chain row only when one *disagrees*, so a correct report left
   * neither, both stayed not-verified, and a replay of a perfectly correct
   * receipt could never reach 'agreed'. `checksFromVerification` now infers
   * them, and this fixes the behaviour in place rather than describing the
   * old defect.
   *
   * What it has to hold the inference to is the ground it rests on, because
   * an inference that fired on the absence of a row would be asserting a
   * check that may never have run. The account is inferred from the verdict
   * — the checker refuses a wrong account before reading the chain, so
   * reaching a comparison is itself the evidence — and the chain only when
   * the report actually named one by id.
   */
  const f = fixture('correct-report');
  const full = buildRun(f);
  assert.equal(full.sealed.artifact.state, 'verified');
  assert.deepEqual(full.sealed.artifact.checks.filter((c) => c.outcome !== 'passed'), []);
  assert.equal(compareRuns(full.sealed.artifact.checks, buildRun(f).sealed.artifact.checks).state, 'agreed');

  // Each inferred row says what established it, rather than appearing as a
  // bare pass a reader would take for a comparison that was made.
  for (const [id, ground] of [
    ['binding.account', /refuses a report about another account before reading the chain/],
    ['binding.chain', /refuses a report naming another chain/],
  ] as Array<[string, RegExp]>) {
    const row = full.sealed.artifact.checks.find((c) => c.id === id);
    assert.equal(row?.outcome, 'passed', id);
    assert.match(row?.limitation ?? '', ground, id);
  }
  // The labels the checker emits on a disagreement are still the labels the
  // mapping knows, so a real Account or Chain row is placed and not inferred.
  assert.ok(KNOWN_CHECK_LABELS.includes('Account') && KNOWN_CHECK_LABELS.includes('Chain'));

  /*
   * The two negatives, which are what stop this being an inference that
   * always fires. A report naming no chain leaves binding.chain unsettled,
   * because the criterion is that the report names its chain and that one did
   * not; and a verdict that never reached a comparison leaves binding.account
   * unsettled, because the checker may have stopped before the account was
   * examined at all.
   */
  const noChain = clone(f);
  delete noChain.report!.chain_id;
  const silent = buildRun(noChain);
  assert.equal(silent.sealed.artifact.checks.find((c) => c.id === 'binding.chain')?.outcome, 'not-verified');
  assert.equal(silent.sealed.artifact.checks.find((c) => c.id === 'binding.account')?.outcome, 'passed');
  assert.equal(silent.sealed.artifact.state, 'unverifiable', 'a report that names no chain is not fully verified');

  const unresolved = buildRun(fixture('pruned-archive'));
  for (const id of ['binding.account', 'binding.chain']) {
    assert.equal(unresolved.sealed.artifact.checks.find((c) => c.id === id)?.outcome, 'not-verified', id);
  }
});

test('6b. zero debt has its dollars compared, so a correct no-borrow report can be verified', () => {
  /*
   * This was the second finding and it is now fixed: `verifyVenusReport`
   * returned from its no-debt branch before the dollar rows were built, so a
   * report correctly saying an account had borrowed nothing had its
   * collateral recorded and never compared — two criteria unsettleable on
   * any zero-debt position, and a run that cannot settle them never reaches
   * verified.
   */
  const f = fixture('zero-debt');
  const { sealed } = buildRun(f);
  assert.deepEqual(sealed.artifact.checks.filter((c) => c.outcome !== 'passed'), []);
  assert.equal(sealed.artifact.state, 'verified');
  for (const id of ['position.debt_usd', 'position.collateral_usd']) {
    const row = sealed.artifact.checks.find((c) => c.id === id);
    assert.equal(row?.outcome, 'passed', id);
    assert.notEqual(row?.observed, '—', `${id} was recorded rather than compared`);
  }

  /*
   * And the comparison bites, which is the half that matters: a wrong
   * collateral figure on a position with no debt is wrong, and must not be
   * excused by the absent ratio. Without this the fix above would pass just
   * as well if the rows were emitted and never judged.
   */
  const wrongCollateral = clone(f);
  wrongCollateral.report!.collateral_usd = 99_000;
  const judged = verifyVenusReport({
    subject: subjectOf(f),
    manifestText: manifestOf(wrongCollateral),
    manifestMatchesChain: true,
    claim: readVenusReportClaim(manifestOf(wrongCollateral)),
    evidence: evidenceOf(f),
  });
  assert.equal(judged.verdict, 'differs');
  assert.match(judged.detail, /no borrow for this account .*which the report gets right, but its collateral \(usd\) figure does not match/i);
  assert.equal(buildRun(wrongCollateral).sealed.artifact.state, 'mismatch');
});

/* ---------- 7. the receipt says what it is and what it is not ---------- */

test('7. the receipt carries the limitations verbatim, and the brief by hash rather than by text', () => {
  const f = fixture('correct-report');
  const { sealed, brief } = buildRun(f);
  const artifact = sealed.artifact;

  for (const line of REPLAY_LIMITATIONS) assert.ok(artifact.limitations.includes(line), line.slice(0, 40));
  assert.ok(artifact.limitations.some((line) => /hash shows these bytes are unaltered/.test(line)));
  assert.ok(artifact.limitations.some((line) => /agent’s own build is not established/.test(line)));

  // The brief can name a wallet and an intention, and a receipt is meant to
  // be shareable, so only its hash travels.
  assert.equal(artifact.briefHash, keccak256(stringToBytes(brief)));
  assert.doesNotMatch(JSON.stringify(artifact), /How close is/);
  assert.equal(artifact.version, ARTIFACT_VERSION);
  assert.equal(artifact.versions.artifact, ARTIFACT_VERSION);
  // Unsigned, and no empty signature field inviting a reader to think one was expected.
  assert.doesNotMatch(JSON.stringify(artifact), /"signature"/);
  assert.equal(artifact.binding.kind, 'signed-terms');
  assert.equal(artifact.subject.deployment, VENUS_COMPTROLLER, 'the deployment is named, never implied by the chain id');
});

/* ---------- 8. wiring, as source facts ---------- */

/**
 * The import graph of a file, following value imports only.
 *
 * `import type` is erased, so a type-only edge cannot drag `server-only` into
 * a process. Written here rather than inferred from a successful run because
 * a run proves the entry point loads, not that nothing in the graph would
 * refuse to load somewhere else.
 */
function importGraph(entry: URL): string[] {
  const root = new URL('../', import.meta.url);
  const seen = new Set<string>();
  const resolve = (spec: string, from: URL): URL | null => {
    const base = spec.startsWith('@/') ? new URL(`src/${spec.slice(2)}`, root) : spec.startsWith('.') ? new URL(spec, from) : null;
    if (!base) return null;
    for (const ext of ['.ts', '.tsx', '.mts', '']) {
      const candidate = new URL(`${base.pathname}${ext}`, root);
      try {
        readFileSync(candidate, 'utf8');
        return candidate;
      } catch {
        /* next extension */
      }
    }
    return null;
  };
  const walk = (file: URL) => {
    if (seen.has(file.pathname)) return;
    seen.add(file.pathname);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/^\s*(?:import|export)\s+(?!type\s)(?:[^;'"]*?from\s*)?['"]([^'"]+)['"]/gm)) {
      const next = resolve(match[1], file);
      if (next) walk(next);
    }
  };
  walk(entry);
  return [...seen];
}

test('8. the verifier is standalone: nothing in its graph needs this server, a database or a route', () => {
  const entry = new URL('../scripts/proofrun-verify.mts', import.meta.url);
  const graph = importGraph(entry);
  assert.ok(graph.length > 10, 'the graph was actually walked');

  for (const file of graph) {
    const text = readFileSync(new URL(`file://${file}`), 'utf8');
    assert.doesNotMatch(text, /^\s*import\s+['"]server-only['"]/m, `${file} is server-only`);
    assert.doesNotMatch(text, /node:sqlite/, `${file} opens a database`);
    assert.doesNotMatch(file, /\/src\/app\//, `${file} is a route`);
  }

  const source = readFileSync(entry, 'utf8');
  // One endpoint and nothing else. No Pokter API, no fetch of its own.
  assert.doesNotMatch(source, /api\/|pokter\.(?:app|xyz|com)|getJobStore|readDeliverable/);
  assert.doesNotMatch(source, /\bfetch\(/);
  // Read-only: no signer, no transaction, nothing that settles.
  for (const forbidden of ['writeContract', 'sendTransaction', 'signMessage', 'privateKey', 'adminSigner', 'settleErc8183', 'approveJob']) {
    assert.doesNotMatch(source, new RegExp(forbidden), `the verifier mentions ${forbidden}`);
  }
  // The comparison is the product's, not a second one written here.
  assert.match(source, /verifyVenusReport/);
  assert.match(source, /compareRuns/);
  assert.match(source, /checksFromVerification/);
  assert.match(source, /checkArtifactIntegrity/);
  assert.match(source, /checkSpecIntegrity/);
  // No arithmetic on health factors of its own: that would be the parallel engine.
  assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /healthFactor\s*[-+/*]|getAccountLiquidity/);
});

test('8b. the routes that produce a verdict and a receipt are wired to the same pure check', () => {
  /*
   * `import 'server-only'` reaches both routes through the deliverable store,
   * so neither can be imported here. Pinned as source facts instead.
   */
  for (const path of ['../src/app/api/jobs/[jobId]/report-check/route.ts', '../src/app/api/proofrun/[chainId]/[jobId]/artifact.json/route.ts']) {
    const route = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(route, /export async function GET/, path);
    assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/, path);
    assert.match(route, /checkDeliveredVenusReport/, path);
    assert.match(route, /readVenusFactsAt/, path);
    assert.match(route, /manifestMatch\(report\.manifestText, report\.committed\) !== null/, path);
  }

  /*
   * The subject rule moved into the shared reader both routes load the
   * delivery through, which is where it belongs: one place decides which
   * account a verdict is about, and it is not either route.
   */
  const reader = readFileSync(new URL('../src/lib/delivery/delivered-report.ts', import.meta.url), 'utf8');
  assert.match(reader, /venusSubjectFromBrief\(brief\)/, 'the subject comes from the brief, not the delivery');

  /*
   * The receipt route composes through `proofRun` and takes the block hash
   * from the same reading the figures came from. Both matter to the replay:
   * a hash from a second lookup could belong to a different read, and a
   * receipt assembled outside `proofRun` would not carry the inferred rows
   * this verifier reproduces.
   */
  const artifact = readFileSync(new URL('../src/app/api/proofrun/[chainId]/[jobId]/artifact.json/route.ts', import.meta.url), 'utf8');
  assert.match(artifact, /proofRun\(\{/);
  assert.match(artifact, /if \(evidence\.available\) blockHash = evidence\.facts\.blockHash;/);
  assert.match(artifact, /provenance: 'customer'/, 'a real job is not labelled a fixture');
});
