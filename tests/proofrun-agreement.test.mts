import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { agreementVerdict, negotiationHashOnChain, type CriteriaAgreement } from '../src/lib/proofrun/agreement';
import { criteriaForTerms, specHashFromCriteria, venusAcceptanceSpec } from '../src/lib/proofrun/acceptance';
import { encodePokterJobEnvelope } from '../src/lib/erc8183/job-envelope';

/*
 * The quote-to-receipt path, proved without funding anything.
 *
 * The quote route computed a binding and returned it in a response body
 * that nothing kept. By the time a receipt was written the signature, the
 * criteria it covered and the terms it was over were gone, so the receipt
 * page built every real job's spec from the scenario default and published
 * `pokter-asserted` for jobs whose agent had signed.
 *
 * Two things have to hold. The agreement must survive a restart, because a
 * receipt is read days after the quote and a value that lives in one
 * process is not a record. And it must apply only to the job it was for:
 * `signed-terms` says a named party signed these exact criteria for this
 * exact job, and anything short of complete evidence is not a weaker
 * version of that claim but a different one.
 *
 * So every negative below asserts `pokter-asserted`, and none of them is
 * an error state — a job with no agreement is the ordinary case.
 */

const COMPTROLLER = '0xfD36E2c2a6789Db23113685031d7F16329158384';
const PROVIDER = '0xB72335e083A7eed9731D24C48dbf07c4Ef1f051a';
const HASH = `0x${'ab'.repeat(32)}`;
const OTHER_HASH = `0x${'cd'.repeat(32)}`;
const SIG = `0x${'11'.repeat(65)}`;
const TASK = 'Venus health factor for 0xd213846db9fd0b8b282e00EF67dd899dA58250cc';

const spec = venusAcceptanceSpec({ deployment: COMPTROLLER, chainId: 56 });
const sent = criteriaForTerms(spec);

/** An agreement in which the agent signed everything it was sent. */
function agreed(over: Partial<CriteriaAgreement> = {}): CriteriaAgreement {
  return {
    negotiationHash: HASH,
    specHash: spec.specHash,
    sentCriteria: sent,
    signedCriteria: sent,
    termsBound: true,
    task: TASK,
    provider: PROVIDER,
    escrowChainId: 97,
    quotedAt: '2026-10-25T09:00:00.000Z',
    ...over,
  };
}

const job = { negotiationHash: HASH, provider: PROVIDER, escrowChainId: 97, task: TASK };

test('a complete agreement for this job binds', () => {
  const verdict = agreementVerdict({ agreement: agreed(), job, spec });
  assert.equal(verdict.binding.kind, 'signed-terms');
  assert.equal(verdict.refusal, null);
  assert.equal(verdict.binding.negotiationHash, HASH);
});

/* ---------------- the negatives, one per piece of evidence ------------- */

test('no agreement at all is the ordinary case, not an error', () => {
  const verdict = agreementVerdict({ agreement: null, job, spec });
  assert.equal(verdict.binding.kind, 'pokter-asserted');
  assert.equal(verdict.refusal, 'no-agreement');
});

test('a job whose chain carries no negotiation hash cannot be bound', () => {
  const verdict = agreementVerdict({ agreement: agreed(), job: { ...job, negotiationHash: null }, spec });
  assert.equal(verdict.binding.kind, 'pokter-asserted');
});

test('an agreement for a different quote does not bind this job', () => {
  const verdict = agreementVerdict({ agreement: agreed({ negotiationHash: OTHER_HASH }), job, spec });
  assert.equal(verdict.binding.kind, 'pokter-asserted');
  assert.equal(verdict.refusal, 'hash-mismatch');
});

test('a different provider does not bind', () => {
  const verdict = agreementVerdict({
    agreement: agreed({ provider: '0x1111111111111111111111111111111111111111' }),
    job,
    spec,
  });
  assert.equal(verdict.binding.kind, 'pokter-asserted');
  assert.equal(verdict.refusal, 'provider-mismatch');
});

test('a different escrow does not bind', () => {
  const verdict = agreementVerdict({ agreement: agreed({ escrowChainId: 56 }), job, spec });
  assert.equal(verdict.binding.kind, 'pokter-asserted');
  assert.equal(verdict.refusal, 'chain-mismatch');
});

test('a different brief does not bind, and the same brief still does', () => {
  const other = agreementVerdict({ agreement: agreed({ task: 'Venus health factor for 0x1111111111111111111111111111111111111111' }), job, spec });
  assert.equal(other.binding.kind, 'pokter-asserted');
  assert.equal(other.refusal, 'task-mismatch');

  /* Compared after the sanitising the hash was computed over, so a bracket
     is not a mismatch between two spellings of one agreement. */
  const bracketed = 'Venus health factor for 0xd213846db9fd0b8b282e00EF67dd899dA58250cc [core]';
  const same = agreementVerdict({
    agreement: agreed({ task: bracketed }),
    job: { ...job, task: bracketed.replace('[core]', '(core)') },
    spec,
  });
  assert.equal(same.binding.kind, 'signed-terms');
});

/*
 * The subtlest one. The agent agreed to a different document — a bumped
 * criteria version, or another deployment — and reporting that as
 * agreement would be the easiest of these to miss.
 */
test('an agreement to a different spec does not bind this check', () => {
  const verdict = agreementVerdict({ agreement: agreed({ specHash: `0x${'ee'.repeat(32)}` }), job, spec });
  assert.equal(verdict.binding.kind, 'pokter-asserted');
  assert.equal(verdict.refusal, 'spec-mismatch');
});

/*
 * What the spec hash covers, pinned because it is easy to "fix" wrongly.
 *
 * The criteria are the agreement; the deployment and the chain are the
 * circumstances it was made in, and `specHashOf` hashes the criteria
 * alone. So two deployments share a hash, and a criteria-version bump does
 * not — which is the right way round, because what an agent agreed to is
 * the list of checks, not where they were run.
 */
test('the spec hash is over the criteria, not the deployment', () => {
  const elsewhere = venusAcceptanceSpec({ deployment: '0x1111111111111111111111111111111111111111', chainId: 56 });
  assert.equal(elsewhere.specHash, spec.specHash, 'the deployment entered the hash of the agreement');
  assert.equal(
    agreementVerdict({ agreement: agreed({ specHash: elsewhere.specHash }), job, spec }).binding.kind,
    'signed-terms',
  );
});

test('a signature that did not cover the terms binds nothing, whatever it echoed', () => {
  const verdict = agreementVerdict({ agreement: agreed({ termsBound: false }), job, spec });
  assert.equal(verdict.binding.kind, 'pokter-asserted');
});

test('an agent that was asked and echoed nothing is recorded, and binds nothing', () => {
  const verdict = agreementVerdict({ agreement: agreed({ signedCriteria: null }), job, spec });
  assert.equal(verdict.binding.kind, 'pokter-asserted');
});

test('prose signed without the spec line does not bind', () => {
  /* The spec line carries the hash of every criterion; the prose only
     summarises it. Agreeing to a summary is not agreeing to the spec. */
  const verdict = agreementVerdict({ agreement: agreed({ signedCriteria: sent.slice(1) }), job, spec });
  assert.equal(verdict.binding.kind, 'pokter-asserted');
});

/* ---------------- the link to the exact job, from chain ---------------- */

test('the negotiation hash is read from the job the escrow holds', () => {
  const envelope = encodePokterJobEnvelope({
    identityChainId: 97,
    agentTokenId: '2618',
    agentName: 'Brinkwatch by Pokter',
    category: 'health-factor',
    provider: PROVIDER,
    task: TASK,
    quote: { negotiationHash: HASH, providerSignature: SIG },
  });
  assert.equal(negotiationHashOnChain(envelope), HASH.toLowerCase());

  /* A reference-anchored job is the quote itself, and carries it too. */
  const reference = JSON.stringify({
    version: 1,
    negotiated_at: 1792918591,
    task: TASK,
    terms: { deliverables: 'A report.', quality_standards: 'Read-only.' },
    price: '100000000000000000',
    currency: '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565',
    negotiation_hash: HASH,
    provider_sig: SIG,
  });
  assert.equal(negotiationHashOnChain(reference), HASH.toLowerCase());
});

test('a job funded outside Pokter’s quote route carries no hash to bind by', () => {
  assert.equal(negotiationHashOnChain('just some text'), null);
  assert.equal(negotiationHashOnChain('{"task":"no quote here"}'), null);
  assert.equal(negotiationHashOnChain(''), null);
});

test('the spec hash is read back out of the criteria that were sent', () => {
  assert.equal(specHashFromCriteria(sent), spec.specHash.toLowerCase());
  assert.equal(specHashFromCriteria(sent.slice(1)), null, 'prose alone names no spec');
  assert.equal(specHashFromCriteria(undefined), null);
});

/*
 * The wiring. All three surfaces are `server-only`; the decision is tested
 * above and the call sites are asserted as source facts, the pattern
 * `tests/provider-route-wiring.test.mts` uses. Comments are stripped, so
 * the comments recording the old behaviour cannot satisfy them.
 */
const source = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test('the quote route records what the agent agreed to', () => {
  const route = source('app/api/hire/quote/route.ts');
  assert.match(route, /recordCriteriaAgreement\(\{/);
  assert.match(route, /signedCriteria: quote\.signedCriteria/, 'it records a verdict instead of the criteria themselves');
  assert.match(route, /specHashFromCriteria\(successCriteria\)/);
  /* Written whenever criteria were sent, so "asked and declined" is
     distinguishable afterwards from "never asked". */
  assert.match(route, /if \(successCriteria && specHashSent\)/);
});

test('the shared loader decides the binding once, for both surfaces', () => {
  const loader = source('lib/delivery/delivered-report.ts');
  assert.match(loader, /negotiationHashOnChain\(job\.description\)/, 'the link no longer comes from the chain');
  assert.match(loader, /criteriaAgreement\(negotiationHash\)/);
  assert.match(loader, /agreementVerdict\(\{/);
  /* The job's own facts are checked against the row, not assumed to match. */
  assert.match(loader, /provider: job\.provider, escrowChainId: input\.chainId, task: brief/);
});

test('the receipt page and the artifact both use it, and neither invents one', () => {
  const page = source('app/(site)/proofrun/[chainId]/[jobId]/page.tsx');
  const artifact = source('app/api/proofrun/[chainId]/[jobId]/artifact.json/route.ts');

  assert.match(page, /binding: report\.binding/, 'the receipt page no longer uses the recorded binding');
  assert.match(artifact, /binding: report\.binding/, 'the artifact no longer uses the recorded binding');

  /* A scenario has no agent behind it, so its default must stay. Only a
     real job gets a binding, and only from the loader. */
  assert.doesNotMatch(page, /kind: 'signed-terms'/, 'the page asserts a binding of its own');
  assert.doesNotMatch(artifact, /kind: 'signed-terms'/, 'the artifact asserts a binding of its own');
});
