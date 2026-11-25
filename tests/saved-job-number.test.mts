import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { getAddress, type Address } from 'viem';

import { jobNextStep, jobPhase, PHASE } from '../src/features/workspace/phase';
import type { HiredJob } from '../src/lib/erc8183/types';
import { checkedSavedJob, savedJobMismatch, unreadJob } from '../src/lib/jobs/record-match';

/*
 * A hire saved in a browser under another job's number. The case is real:
 * a 0.05 hire of BORT Yield Weaver was saved as testnet job #1382, and #1382
 * on the escrow is another buyer's 1 $U job for another agent, settled. The
 * hire showed as "Settled" with its amount in base units, because every
 * refresh copied that job's status and no lookup would name its token.
 */

const BORT = getAddress('0x60eF148485C2a5119fa52CA13c52E9fd98F28e87');
const OTHER_AGENT = getAddress('0xdB4E54b0De9dee384a2B4bc5597C40E90C1E53c9');
const OTHER_BUYER = getAddress('0x1cC9c47969DF5703952EC5048dC71F69aDF89A4a');
const BUYER = getAddress('0x3fb8779f4f42e1800F27AAec9564530BCaa852Bf');
const TEST_U = getAddress('0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565');
const AT = '2026-11-24T19:00:00.000Z';
const ZERO = '0x0000000000000000000000000000000000000000';

const saved = (over: Partial<HiredJob> = {}): HiredJob => ({
  id: 'local-1',
  jobId: '1382',
  chainId: 97,
  isTestnet: true,
  agentChainId: 56,
  agentTokenId: '153698',
  agentName: 'BORT Yield Weaver #10997',
  provider: BORT,
  task: 'Analyse the available BNB Chain yield opportunities.',
  budgetRaw: '50000000000000000',
  paymentToken: null,
  expiredAt: '2026-10-03T00:00:00.000Z',
  hiredAt: '2026-10-02T00:00:00.000Z',
  hireTxHash: null,
  status: 'COMPLETED',
  statusCheckedAt: AT,
  deliverableUrl: null,
  settleTxHash: null,
  ...over,
});

test('the escrow’s job with this number paying another agent is not this hire', () => {
  const mismatch = savedJobMismatch({ client: OTHER_BUYER, provider: OTHER_AGENT }, saved(), AT);
  assert.deepEqual(mismatch, { checkedAt: AT, provider: OTHER_AGENT, client: OTHER_BUYER });
});

test('an empty answer is not evidence either way: a node behind the chain answers a just-funded job that way', () => {
  assert.equal(unreadJob({ client: ZERO }), true);
  assert.equal(savedJobMismatch({ client: ZERO, provider: ZERO }, saved(), AT), null);
  assert.equal(checkedSavedJob(saved(), { client: ZERO, provider: ZERO }, null, AT), null, 'nothing is written');
});

test('the same agent, funded by another wallet than the one read for this hire, is not this hire', () => {
  assert.ok(savedJobMismatch({ client: OTHER_BUYER, provider: BORT }, saved({ client: BUYER }), AT));
});

test('a job paying this hire’s agent is this hire, whoever funded it when the hire never read its funder: a free trial is funded by Pokter', () => {
  assert.equal(savedJobMismatch({ client: OTHER_BUYER, provider: BORT.toLowerCase() as Address }, saved(), AT), null);
  assert.equal(savedJobMismatch({ client: BUYER, provider: BORT }, saved({ client: BUYER }), AT), null);
});

test('a checked hire is flagged once, cleared when its number checks out, and given the token the escrow names', () => {
  const flagged = checkedSavedJob(saved(), { client: OTHER_BUYER, provider: OTHER_AGENT }, TEST_U, AT);
  assert.ok(flagged?.numberMismatch);
  assert.equal(flagged.paymentToken, null, 'another job’s token is never taken');
  assert.equal(flagged.status, 'COMPLETED', 'and its status is left as saved, not copied');
  assert.equal(checkedSavedJob(flagged, { client: OTHER_BUYER, provider: OTHER_AGENT }, null, AT), null, 'nothing new to write');

  const cleared = checkedSavedJob(flagged, { client: BUYER, provider: BORT }, TEST_U, AT);
  assert.equal(cleared?.numberMismatch, null);
  assert.equal(cleared?.paymentToken, TEST_U);

  assert.equal(checkedSavedJob(saved({ paymentToken: TEST_U }), { client: BUYER, provider: BORT }, null, AT), null, 'a matching hire with its token needs nothing');
  assert.equal(checkedSavedJob(saved(), { client: BUYER, provider: BORT }, null, AT), null, 'an unread token is not written as anything');
});

test('a flagged hire reads as saved under the wrong number, whatever status it was saved with', () => {
  const job = saved({ numberMismatch: { checkedAt: AT, provider: OTHER_AGENT, client: OTHER_BUYER } });
  assert.equal(jobPhase(job), 'mismatch');
  assert.equal(PHASE.mismatch.label, 'Wrong job number');
  assert.equal(PHASE.mismatch.needsYou, false);
  assert.equal(jobNextStep(job).text, 'Saved under another job’s number');
  assert.equal(jobPhase(saved()), 'settled', 'unchecked, it is what it was saved as');
});

test('the job page and the list both check the number before reading anything from it', async () => {
  const actions = await readFile(new URL('../src/lib/jobs/useJobActions.ts', import.meta.url), 'utf8');
  const sync = actions.slice(actions.indexOf('const syncFromChain'));
  assert.ok(sync.indexOf('if (unreadJob(current)) return;') < sync.indexOf('savedJobMismatch(current, job'), 'an empty answer changes nothing');
  assert.ok(sync.indexOf('savedJobMismatch(current, job') < sync.indexOf('const delivered'), 'checked before any status or delivery is read');
  assert.match(actions, /const needsCurrency = !job\.numberMismatch && !job\.paymentToken;/);
  const hooks = await readFile(new URL('../src/features/workspace/hooks.ts', import.meta.url), 'utf8');
  assert.match(hooks, /checkedSavedJob\(job, onchain, token, checkedAt\)/);
  assert.match(hooks, /if \(!onchain\) continue;/, 'an unread job is never flagged');
  const parts = await readFile(new URL('../src/features/workspace/parts.tsx', import.meta.url), 'utf8');
  assert.match(parts, /<JobAmount job=\{job\} \/>/);
  assert.match(parts, />Currency unknown</);
});
