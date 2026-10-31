import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { stoppedHireEvent } from '../src/lib/conversion/funnel';
import { explainFailure } from '../src/lib/hire/failure';
import { acknowledgeAttempt, acknowledgedAttempt, attemptUnchanged, type PublicAttempt } from '../src/lib/hire/remote-attempt-client';

/*
 * Another hire from the same wallet, and a page that breaks mid-hire: what
 * the buyer is told, and that confirming past a warning sticks and leads
 * back into funding.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const record = (over: Partial<PublicAttempt> = {}): PublicAttempt => ({
  publicId: 'a1b2c3d4e5f6a1b2c3d4e5f6',
  chainId: 56,
  verified: false,
  startedAt: '2026-10-26T22:21:16.000Z',
  updatedAt: '2026-10-26T22:21:16.000Z',
  jobId: null,
  predictedJobId: null,
  txHashes: [],
  prompt: null,
  fundableUntil: null,
  token: '0x55d398326f99059ff775485246999027b3197955',
  amountRaw: '100000000000000000',
  ...over,
});

test('a stop for another hire from the wallet has its own headline, not a price problem', () => {
  const warned = explainFailure('Another hire from this wallet was started and not finished…', 'attempt', 'remote-attempt-warning');
  assert.equal(warned.title, 'Another hire from this wallet comes first');
  assert.notEqual(warned.title, 'The agent’s price cannot be paid here');
  assert.equal(explainFailure('This exact brief and signed quote already funded job 7…', 'attempt', 'already-funded').title, 'This brief already funded a job');
  // A price that cannot be paid keeps its own headline.
  assert.equal(explainFailure('…', 'payment').title, 'The agent’s price cannot be paid here');
  // Still counted as a hire that stopped, as before.
  assert.equal(stoppedHireEvent('attempt'), 'hire_failed');
});

test('every stop for another attempt is in the attempt layer, and says nothing was sent from this page', () => {
  const hook = code('lib/hire/useHire.ts');
  for (const id of ['remote-attempt-warning', 'funding-pending-elsewhere', 'funding-pending', 'already-funded']) {
    assert.doesNotMatch(hook, new RegExp(`'payment',\\s*'${id}'`), `${id} is not a payment failure`);
    assert.match(hook, new RegExp(`'attempt',\\s*'${id}'`), id);
  }
  assert.doesNotMatch(hook, /has not sent anything yet/, 'the record shows no transaction; it cannot show none was signed');
  assert.doesNotMatch(hook, /Nothing new was sent/);
});

test('a confirmation is kept per record, and does not cover a different one', () => {
  assert.equal(acknowledgedAttempt('0xAbC0000000000000000000000000000000000001', 56), null);
  acknowledgeAttempt('0xAbC0000000000000000000000000000000000001', 56, 'one');
  assert.equal(acknowledgedAttempt('0xabc0000000000000000000000000000000000001', 56), 'one', 'by wallet, whatever its case');
  assert.equal(acknowledgedAttempt('0xabc0000000000000000000000000000000000001', 97), null, 'and by chain');
  // In the browser it is written to storage, so a reload keeps it.
  assert.match(code('lib/hire/remote-attempt-client.ts'), /window\.localStorage\.setItem\(key, publicId\)/);
  assert.match(code('lib/hire/useHire.ts'), /acknowledgedAttempt\(walletAddress, escrowChainId\) !== remoteNow\.publicId/);
  assert.doesNotMatch(code('lib/hire/useHire.ts'), /remoteAcknowledged/);
});

test('a record that changed since the buyer looked is never continued past', () => {
  const seen = record();
  assert.equal(attemptUnchanged(seen, record()), true);
  assert.equal(attemptUnchanged(seen, record({ verified: true })), false);
  assert.equal(attemptUnchanged(seen, record({ txHashes: [`0x${'1'.repeat(64)}`] })), false);
  assert.equal(attemptUnchanged(seen, record({ jobId: '57140' })), false);
  assert.equal(attemptUnchanged(seen, record({ prompt: 'funding' })), false);
  assert.equal(attemptUnchanged(seen, record({ publicId: 'another' })), false);
});

test('confirming rechecks first, then funds only when the fund button itself could', () => {
  const hook = code('lib/hire/useHire.ts');
  const acknowledge = hook.slice(hook.indexOf('acknowledgeRemote: async'), hook.indexOf('recheckRemote: async'));
  assert.ok(acknowledge.indexOf('fetchOpenAttempt') < acknowledge.indexOf('acknowledgeAttempt('), 'asked again before it is kept');
  assert.match(acknowledge, /!attemptUnchanged\(remoteOpen\.attempt, now\)/);
  assert.match(acknowledge, /setError\(null\);[\s\S]*setState\('idle'\);\s*return 'continue';/);
  const flow = code('features/hire/HireFlow.tsx');
  assert.match(flow, /if \(\(await hire\.acknowledgeRemote\(\)\) === 'continue' && canFund\) await hire\.commission\(\);/);
  assert.match(flow, /disabled=\{!canFund\}/, 'the fund button and the warning share one guard');
  // The warning carries the stop; it is not repeated in red.
  assert.match(flow, /\{failure && !\(hire\.remoteOpen && hire\.errorLayer === 'attempt'\) && \(/);
  // A server that cannot be asked keeps the warning, and a recheck says when it looked.
  const recheck = hook.slice(hook.indexOf('recheckRemote: async'), hook.indexOf('/** The non-$U token'));
  assert.match(recheck, /if \(now === 'unavailable'\) \{\s*setRemoteCheck\(\{ at, result: 'unavailable' \}\);\s*return;/);
  assert.match(flow, /Checked again at /);
});

test('the error page promises nothing about what was sent, and reports the failure', () => {
  const page = code('app/error.tsx');
  assert.doesNotMatch(page, /Nothing you were doing was submitted/);
  assert.doesNotMatch(page, /slow to answer/);
  assert.match(page, /Check your wallet&rsquo;s activity, and your hires, before you try again\./);
  assert.match(page, /href="\/workspace"/);
  assert.match(page, /fetch\('\/api\/client-errors'/);
  const route = code('app/api/client-errors/route.ts');
  assert.match(route, /split\('\?'\)\[0\]/, 'a path is logged without its query, where a brief can sit');
  assert.match(route, /consumeRateLimit\(`client-errors:/);
});
