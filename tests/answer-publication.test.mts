import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { answerIsPublic, DECISION_MAX_AGE_MS, decisionIsFresh, publicationMessage } from '../src/lib/jobs/answer-publication';

/*
 * A delivered answer is the buyer's to publish. The evidence pages and
 * agent samples showed every buyer's answer, and the sitemap offered them
 * to search engines; status, token, amount and the hash check stay public
 * on every job, and the answer waits for the funding wallet's choice.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the answer is public for Pokter’s tests and self-hires, and for anyone else only once the buyer publishes it', () => {
  assert.equal(answerIsPublic('team', null), true);
  assert.equal(answerIsPublic('self', null), true);
  for (const funder of ['outside', 'unknown'] as const) {
    assert.equal(answerIsPublic(funder, null), false, `${funder}, no decision`);
    assert.equal(answerIsPublic(funder, { published: false, decidedAt: '2026-10-27T12:00:00.000Z' }), false, `${funder}, declined`);
    assert.equal(answerIsPublic(funder, { published: true, decidedAt: '2026-10-27T12:00:00.000Z' }), true, `${funder}, published`);
  }
});

test('the signed words name the job, its network and both directions, and say they move nothing', () => {
  const publish = publicationMessage({ chainId: 56, jobId: '57103', publish: true, decidedAt: '2026-10-27T12:00:00.000Z' });
  const stop = publicationMessage({ chainId: 56, jobId: '57103', publish: false, decidedAt: '2026-10-27T12:00:00.000Z' });
  assert.match(publish, /job #57103 on BNB Chain/);
  assert.match(publish, /^Pokter may show the answer/);
  assert.match(stop, /^Pokter must stop showing the answer/);
  for (const m of [publish, stop]) {
    assert.match(m, /It moves no funds and grants nothing else\./);
    assert.match(m, /Decided at: 2026-10-27T12:00:00\.000Z$/);
  }
  assert.match(publicationMessage({ chainId: 97, jobId: '1', publish: true, decidedAt: '2026-10-27T12:00:00.000Z' }), /on BNB Testnet/);
});

test('a decision is accepted only while fresh, so an old signature cannot be replayed', () => {
  const now = Date.parse('2026-10-27T12:00:00.000Z');
  assert.equal(decisionIsFresh('2026-10-27T11:59:00.000Z', now), true);
  assert.equal(decisionIsFresh(new Date(now - DECISION_MAX_AGE_MS - 1000).toISOString(), now), false, 'too old');
  assert.equal(decisionIsFresh('2026-10-27T12:05:00.000Z', now), false, 'too far ahead');
  assert.equal(decisionIsFresh('2026-10-27 11:59', now), false, 'only the exact ISO form the page signs');
});

test('every surface that publishes an answer applies the rule, and buyers are told before they fund', () => {
  assert.match(code('lib/jobs/evidence.ts'), /answerIsPublic\(funder, getJobStore\(\)\.answerPublication\(chainId, jobId\)\)/);
  assert.match(code('lib/agent/sample-delivery.ts'), /answerIsPublic\(funderOf\(job\), store\.answerPublication\(job\.chainId, job\.jobId\)\)/);
  const answer = code('features/workspace/JobAnswer.tsx');
  assert.match(answer, /const withheld = !owned && data\.readable && data\.published === false;/);
  assert.match(answer, /\{withheld \? \(\s*<span className="text-ink-3">The delivered file is linked for the wallet that funded the job\.<\/span>/, 'and not one click away either');
  assert.match(answer, /owned && data\.matchesChain && \(data\.funder === 'outside' \|\| data\.funder === 'unknown'\) && <AnswerPublication/);
  assert.match(code('app/api/jobs/[jobId]/answer/route.ts'), /published: answerIsPublic\(funder, decision\)/);
  assert.match(code('features/hire/HireFlow.tsx'), /Your brief is public on chain, and so is the link to the agent’s answer\. Don’t include secrets\. Pokter shows the answer on its own pages only if you publish it after delivery\./);
  /* The signature is checked against the escrow's own client, never Pokter's index. */
  const route = code('app/api/jobs/[jobId]/publication/route.ts');
  assert.match(route, /const client = getAddress\(job\.client\);/);
  assert.match(route, /signedByWallet\(chainId, client, message, signature\)/);
  assert.match(route, /consumeRateLimit\(`job-publication:/);
  /* Refused before the chain is read: a malformed body, a stale or future signature, a job with no page. */
  assert.ok(route.indexOf('decisionIsFresh(body.decidedAt)') < route.indexOf('getErc8183Job('));
  assert.ok(route.indexOf('if (!indexedJob(chainId, jobId))') < route.indexOf('getErc8183Job('));
});
