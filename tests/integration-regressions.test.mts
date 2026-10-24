/**
 * The four defects found when the agent-1 and ProofRun branches were
 * combined, each held to its fix on the integration commit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { keccak256, stringToBytes } from 'viem';

import type { VenusReportVerification } from '../src/lib/delivery/venus-report-check';
import { venusSubjectFromBrief } from '../src/lib/delivery/venus-report-check';
import { storedDeliveryText } from '../src/lib/erc8183/deliverable-gate';
import { checksFromVerification, stateFromChecks } from '../src/lib/proofrun/checks';

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

function matched(): VenusReportVerification {
  return {
    verdict: 'matches',
    headline: 'Matches',
    detail: '',
    block: '90000000',
    blockTime: null,
    values: [{ label: 'Health factor', reported: '1.48', checked: '1.48', agrees: true }],
    evidence: [],
    method: [],
    tolerance: [],
    limitations: [],
  };
}

test('missing account: a report that names no account does not pass the account check', () => {
  const unnamed = checksFromVerification({ verification: matched(), accountNamed: false });
  const account = unnamed.find((c) => c.id === 'binding.account')!;
  assert.equal(account.outcome, 'not-verified');
  assert.match(account.limitation ?? '', /does not say which account/);
  assert.notEqual(stateFromChecks(unnamed), 'verified', 'a run with an unconfirmed subject is never verified as a whole');

  const omitted = checksFromVerification({ verification: matched() });
  assert.equal(omitted.find((c) => c.id === 'binding.account')!.outcome, 'not-verified', 'unknown is not named');

  const named = checksFromVerification({ verification: matched(), accountNamed: true });
  assert.equal(named.find((c) => c.id === 'binding.account')!.outcome, 'passed', 'a named account the checker compared still passes');
  assert.match(source('lib/proofrun/run.ts'), /accountNamed: Boolean\(claim\?\.ok && claim\.claim\.account\)/);
});

test('subject chain: the replay records the position’s chain, not the escrow that funded the job', () => {
  const subject = venusSubjectFromBrief('Report the health factor for 0x4f43d4173227bF19b180f1f54804bF2C9045297B.');
  assert.ok(subject.ok);
  assert.equal(subject.ok && subject.subject.chainId, 56, 'Venus Core Pool lives on BNB Chain whichever escrow funded the hire');
  const route = source('app/api/proofrun/[chainId]/[jobId]/artifact.json/route.ts');
  assert.match(route, /job: \{ chainId, jobId \}/, 'the job keeps its escrow chain');
  assert.match(route, /chainId: report\.subject\.chainId,/, 'the subject takes the brief’s pinned chain');
  assert.doesNotMatch(route, /deployment: VENUS_COMPTROLLER,\s*chainId,/);
});

test('delivery access: the shared report loader never takes a draft for the delivery', () => {
  const draft = JSON.stringify({ v: 1 });
  const submitted = keccak256(stringToBytes(JSON.stringify({ v: 2 })));
  assert.equal(storedDeliveryText({ manifestText: draft, submitTxHash: null }, submitted), null);
  assert.match(source('lib/delivery/delivered-report.ts'), /storedDeliveryText\(readDeliverable\(deliverableKey\(input\.chainId, input\.jobId\)\), job\.deliverable\)/);
  assert.doesNotMatch(source('lib/delivery/delivered-report.ts'), /readDeliverable\(deliverableKey\(input\.chainId, input\.jobId\)\)\?\.manifestText/);
});

test('x402: no retry outcome is the ambiguous "already sent"', () => {
  const call = source('lib/x402/call.ts');
  assert.doesNotMatch(call, /'already-sent'/);
  for (const kind of ["'answered'", "'refused'", "'unknown'", "'in-flight'"]) assert.match(call, new RegExp(kind));
  assert.match(source('lib/x402/receipts.ts'), /state = 'not-sent'/, 'only a never-sent authorization is reclaimed');
});
