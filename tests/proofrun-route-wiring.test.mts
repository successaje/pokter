import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * `import 'server-only'` reaches these routes through their own imports,
 * so nothing in `tests/` can load them. The decisions live in pure modules
 * with their own tests; what is left is the wiring, asserted as a source
 * fact — the pattern `tests/passkey-signature-verify.test.mts` uses.
 *
 * Comments are stripped before matching, so a claim here cannot be
 * satisfied by a comment that merely mentions the thing the code was
 * supposed to do. That matters more than usual in this file: the block
 * hash below was briefly a hardcoded `null` sitting under a comment
 * describing it as read from the chain.
 */
const source = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const ARTIFACT = source('app/api/proofrun/[chainId]/[jobId]/artifact.json/route.ts');
const REPORT_CHECK = source('app/api/jobs/[jobId]/report-check/route.ts');
const LOADER = source('lib/delivery/delivered-report.ts');

/*
 * One fetch of the delivery, shared.
 *
 * Two routes each fetching their own copy is how a verifier ends up
 * checking a different document from the one the buyer is reading, and
 * the difference would be invisible from either side.
 */
test('both routes read the delivery through the one loader', () => {
  for (const [name, route] of [['artifact', ARTIFACT], ['report-check', REPORT_CHECK]] as const) {
    assert.match(route, /loadDeliveredVenusReport\(/, `the ${name} route does not use the shared loader`);
    assert.doesNotMatch(route, /getErc8183Job\(/, `the ${name} route fetches its own job again`);
    assert.doesNotMatch(route, /fetchDeliverableText\(/, `the ${name} route fetches its own copy of the delivery`);
  }
});

/*
 * The hash has to come from the reading the figures came from.
 *
 * It was a hardcoded `null` here for one revision, under a comment saying
 * it was read where the facts were read. A second lookup would be no
 * better: the hash would then be able to belong to a different read than
 * the numbers it is meant to pin.
 */
test('the artifact takes its block hash from the same read as the figures', () => {
  assert.match(ARTIFACT, /evidence\.facts\.blockHash/, 'the block hash is not taken from the facts that were read');
  assert.match(ARTIFACT, /blockHash,/, 'the captured hash is not passed into the run');
  assert.doesNotMatch(ARTIFACT, /blockHash:\s*null/, 'the block hash is hardcoded null');
});

/*
 * A receipt with no checks is indistinguishable, to anything consuming
 * it, from a run where nothing was wrong. So a refusal returns no
 * artifact at all rather than an empty one.
 */
test('a refusal returns no artifact rather than an empty one', () => {
  assert.match(ARTIFACT, /artifact:\s*null/, 'a refusal does not explicitly return a null artifact');
  assert.match(ARTIFACT, /status:\s*loaded\.refusal\.code === 'not-this-check' \? 404 : 409/);
});

/* Real buyer work must never be indistinguishable from a fixture run. */
test('the job route marks its runs as customer work', () => {
  assert.match(ARTIFACT, /provenance:\s*'customer'/, 'a real delivery is not labelled as customer work');
  assert.doesNotMatch(ARTIFACT, /provenance:\s*'fixture'/, 'a real delivery is labelled as a fixture');
});

/* Advisory, and it must stay that way: ProofRun informs the buyer and
   does not touch settlement in this version. */
test('neither route settles anything', () => {
  for (const [name, route] of [['artifact', ARTIFACT], ['report-check', REPORT_CHECK]] as const) {
    assert.match(route, /export async function GET\(/, `the ${name} route is not a GET`);
    for (const forbidden of ['complete(', 'claimRefund(', 'writeContract', 'sendTransaction', 'approve(']) {
      assert.ok(!route.includes(forbidden), `the ${name} route calls ${forbidden}, which would make an advisory check settle a job`);
    }
  }
});

/*
 * The loader's refusals are what the buyer reads, so they stay distinct.
 * Collapsing them into one "could not check" would lose the only part a
 * reader can act on.
 */
test('the loader keeps its refusals apart', () => {
  for (const code of [
    'not-this-check',
    'nothing-delivered',
    'no-subject',
    'ambiguous-subject',
    'no-deliverable-link',
    'deliverable-unreadable',
  ]) {
    assert.ok(LOADER.includes(`'${code}'`), `the loader lost the ${code} refusal`);
  }
});

/*
 * The subject comes from the brief and never from the report. Taking it
 * from the delivery would let a report choose which position it is about
 * and then be graded against its own choice.
 */
test('the account comes from the brief, not from the delivery', () => {
  assert.match(LOADER, /venusSubjectFromBrief\(brief\)/);
  /* Anchored on the read itself, not on the first mention of the word:
     `manifestText` appears in the interface above the function, so
     slicing from that matched the declaration and not the order. */
  const read = LOADER.indexOf('readDeliverable(deliverableKey(');
  assert.ok(read > 0, 'the loader no longer reads the delivery where this test expects');
  assert.ok(
    LOADER.indexOf('venusSubjectFromBrief(brief)') < read,
    'the subject is derived after the delivery is read, so a report could choose its own subject',
  );
});
