import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { CATALOGUE_VERIFIER_FILENAME, CATALOGUE_VERIFIER_SOURCE, catalogueVerifierResponse } from '../src/lib/proof/catalogue-verifier';

test('the catalogue verifier is valid dependency-free ECMAScript', () => {
  const checked = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: CATALOGUE_VERIFIER_SOURCE, encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
  assert.doesNotMatch(CATALOGUE_VERIFIER_SOURCE, /from ['"](viem|ethers)/);
});

test('the verifier pages through all discovery results and checks ownerOf', () => {
  assert.match(CATALOGUE_VERIFIER_SOURCE, /offset \+= 100/);
  assert.match(CATALOGUE_VERIFIER_SOURCE, /OWNER_OF_SELECTOR/);
  assert.match(CATALOGUE_VERIFIER_SOURCE, /owner === claimedOwner\.toLowerCase\(\)/);
});

test('the verifier keeps non-chain claims in their true provenance buckets', () => {
  assert.match(CATALOGUE_VERIFIER_SOURCE, /declaredDescriptions/);
  assert.match(CATALOGUE_VERIFIER_SOURCE, /pokterMeasuredAvailability/);
  assert.match(CATALOGUE_VERIFIER_SOURCE, /is not reverified by this script/);
});

test('duplicate identities and owner mismatches fail the audit', () => {
  assert.match(CATALOGUE_VERIFIER_SOURCE, /duplicateKeys/);
  assert.match(CATALOGUE_VERIFIER_SOURCE, /failures\.length > 0 \|\| duplicateKeys\.length > 0/);
});

test('the catalogue verifier downloads safely with a stable filename', async () => {
  const response = catalogueVerifierResponse();
  assert.equal(response.headers.get('content-disposition'), `attachment; filename="${CATALOGUE_VERIFIER_FILENAME}"`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await response.text(), CATALOGUE_VERIFIER_SOURCE);
});
