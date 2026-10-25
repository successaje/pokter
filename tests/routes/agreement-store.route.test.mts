import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { agreementVerdict, type CriteriaAgreement } from '../../src/lib/proofrun/agreement';
import { criteriaForTerms, venusAcceptanceSpec } from '../../src/lib/proofrun/acceptance';

/*
 * That the agreement is a record and not a value in one process.
 *
 * A receipt is read days after the quote, so "it was written" has to be
 * proved by reading it back through a second connection to the same file.
 * Tested here rather than beside the decision because the store is
 * `server-only` and unreachable from the plain runner.
 */

const COMPTROLLER = '0xfD36E2c2a6789Db23113685031d7F16329158384';
const PROVIDER = '0xB72335e083A7eed9731D24C48dbf07c4Ef1f051a';
const HASH = `0x${'ab'.repeat(32)}`;
const OTHER_HASH = `0x${'cd'.repeat(32)}`;
const TASK = 'Venus health factor for 0xd213846db9fd0b8b282e00EF67dd899dA58250cc';

const spec = venusAcceptanceSpec({ deployment: COMPTROLLER, chainId: 56 });
const sent = criteriaForTerms(spec);

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


test('an agreement survives a restart, read back through a new connection', async () => {
  const { openJobStore } = await import('../../src/lib/erc8183/store');
  const dir = mkdtempSync(join(tmpdir(), 'pokter-agreement-'));
  const path = join(dir, 'jobs.db');

  const writer = openJobStore(path);
  writer.recordCriteriaAgreement(agreed());

  /* A different store object on the same file: what a restart looks like,
     and the only way the claim "it was written" is actually tested. */
  const reader = openJobStore(path);
  const read = reader.criteriaAgreement(HASH);
  assert.ok(read, 'nothing came back after reopening the database');
  assert.deepEqual(read.sentCriteria, sent);
  assert.deepEqual(read.signedCriteria, sent);
  assert.equal(read.termsBound, true);
  assert.equal(read.specHash, spec.specHash.toLowerCase());
  assert.equal(read.task, TASK);
  assert.equal(read.escrowChainId, 97);

  /* And it still binds after the round trip, which is the point of keeping it. */
  assert.equal(agreementVerdict({ agreement: read, job, spec }).binding.kind, 'signed-terms');

  /* Lookup is case-insensitive, because the chain's hash and ours may differ in case. */
  assert.ok(reader.criteriaAgreement(HASH.toUpperCase().replace('0X', '0x')));
  assert.equal(reader.criteriaAgreement(OTHER_HASH), null, 'an unknown hash returned a row');
});

test('an agent that echoed nothing is stored as that, not as missing', async () => {
  const { openJobStore } = await import('../../src/lib/erc8183/store');
  const dir = mkdtempSync(join(tmpdir(), 'pokter-agreement-none-'));
  const store = openJobStore(join(dir, 'jobs.db'));
  store.recordCriteriaAgreement(agreed({ signedCriteria: null }));

  const read = openJobStore(join(dir, 'jobs.db')).criteriaAgreement(HASH);
  assert.ok(read);
  assert.equal(read.signedCriteria, null, '"asked and declined" came back as "never asked"');
  assert.equal(agreementVerdict({ agreement: read, job, spec }).binding.kind, 'pokter-asserted');
});

/*
 * Re-quoting the same brief produces a different hash, because
 * `negotiated_at` is inside it — so a replace can only ever overwrite one
 * reading of one signature with a later reading of the same signature.
 */
test('re-recording the same hash keeps the latest reading rather than duplicating', async () => {
  const { openJobStore } = await import('../../src/lib/erc8183/store');
  const dir = mkdtempSync(join(tmpdir(), 'pokter-agreement-replace-'));
  const path = join(dir, 'jobs.db');
  const store = openJobStore(path);
  store.recordCriteriaAgreement(agreed({ signedCriteria: null }));
  store.recordCriteriaAgreement(agreed());

  const read = openJobStore(path).criteriaAgreement(HASH);
  assert.deepEqual(read?.signedCriteria, sent);
});
