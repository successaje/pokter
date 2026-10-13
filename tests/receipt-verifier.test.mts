import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { RECEIPT_VERIFIER_FILENAME, RECEIPT_VERIFIER_SOURCE, receiptVerifierResponse } from '../src/lib/proof/verifier';

test('the downloaded verifier is valid ECMAScript', () => {
  const checked = spawnSync(process.execPath, ['--check', '--input-type=module'], {
    input: RECEIPT_VERIFIER_SOURCE,
    encoding: 'utf8',
  });
  assert.equal(checked.status, 0, checked.stderr);
});

test('the verifier is dependency-free and checks chain state rather than explorer HTML', () => {
  assert.match(RECEIPT_VERIFIER_SOURCE, /eth_call/);
  assert.match(RECEIPT_VERIFIER_SOURCE, /GET_JOB_SELECTOR/);
  assert.match(RECEIPT_VERIFIER_SOURCE, /status: chain\.status === receipt\.status/);
  assert.match(RECEIPT_VERIFIER_SOURCE, /provider: chain\.provider/);
  assert.match(RECEIPT_VERIFIER_SOURCE, /budget: chain\.budgetRaw/);
  assert.doesNotMatch(RECEIPT_VERIFIER_SOURCE, /from ['"](viem|ethers)/);
});

test('the verifier derives team funding from the onchain client', () => {
  assert.match(RECEIPT_VERIFIER_SOURCE, /team\.has\(chain\.client\)/);
  assert.match(RECEIPT_VERIFIER_SOURCE, /fundingProvenance: derivedTeam === receipt\.fundedByPokter/);
});

test('the verifier reports failures and exits nonzero on disagreement', () => {
  assert.match(RECEIPT_VERIFIER_SOURCE, /failures: rows\.filter/);
  assert.match(RECEIPT_VERIFIER_SOURCE, /process\.exitCode = 1/);
});

test('the verifier downloads with a stable filename and safe headers', async () => {
  const response = receiptVerifierResponse();
  assert.equal(response.headers.get('content-disposition'), `attachment; filename="${RECEIPT_VERIFIER_FILENAME}"`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await response.text(), RECEIPT_VERIFIER_SOURCE);
});
