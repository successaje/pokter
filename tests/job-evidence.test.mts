import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { briefIsPublic, BUYER_WALLET, FUNDER_LABEL, fundedWhen, jobEvidencePath, jobFunder, jobStatusWords, publishableAnswerText, wasDelivered } from '../src/lib/jobs/evidence-view';

/*
 * One job as public evidence: what the escrow records and Pokter's check
 * of the delivery, for every job Pokter commissioned — and the buyer's
 * brief and answer only for Pokter's own test jobs. These pin the rule,
 * where it is applied, and the places that link the page.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const TEAM = new Set(['0x00000000000000000000000000000000000000aa']);
const AGENT = '0x00000000000000000000000000000000000000Bb';

test('who funded a job: the team, the agent’s own operator, an outside buyer, or unreadable', () => {
  assert.equal(jobFunder({ client: '0x00000000000000000000000000000000000000AA', provider: AGENT }, TEAM), 'team');
  assert.equal(jobFunder({ client: AGENT.toLowerCase(), provider: AGENT }, TEAM), 'self');
  assert.equal(jobFunder({ client: '0x00000000000000000000000000000000000000cc', provider: AGENT }, TEAM), 'outside');
  /* The team list counts a job with no client as the team's; here that would publish a stranger's brief on a guess. */
  assert.equal(jobFunder({ client: undefined, provider: AGENT }, TEAM), 'unknown');
  assert.equal(jobFunder({ client: '0x0000000000000000000000000000000000000000', provider: AGENT }, TEAM), 'unknown');
  for (const funder of ['team', 'self', 'outside', 'unknown'] as const) assert.ok(FUNDER_LABEL[funder]);
});

test('that a job was delivered is public on every job; its answer only when public, and the brief only for Pokter’s own test jobs', () => {
  assert.equal(briefIsPublic('team'), true);
  for (const funder of ['self', 'outside', 'unknown'] as const) assert.equal(briefIsPublic(funder), false, funder);
  const loader = code('lib/jobs/evidence.ts');
  assert.match(loader, /brief: briefIsPublic\(funder\) \? indexed\.task : null/);
  assert.match(loader, /if \(answerIsPublic\(funder, getJobStore\(\)\.answerPublication\(chainId, jobId\)\)\) answer = readDeliveredAnswer\(publishableAnswerText\(read\.text, funder, chain\.client\)\);\s*else answerWithheld = true;/, 'a published answer, never one that fails its own hash');
  const view = code('features/delivery/AnswerView.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(view, /\.asked\b/, 'the shared answer view never prints the brief');
  const page = code('app/(site)/jobs/[chainId]/[jobId]/page.tsx');
  assert.match(page, /e\.brief !== null \?/);
  assert.match(page, /The buyer has not published the answer, so Pokter does not show it\./);
  assert.doesNotMatch(page, /What the agent delivered is its own work, and is shown in full/);
  assert.match(page, /<DeliveredAnswerView answer=\{e\.answer\}/);
  /* The buyer's address is never shown, as the receipts API never returns it. */
  assert.doesNotMatch(page, /\.client\b/);
  assert.match(page, /\{e\.brief !== null && \(e\.delivery\.state === 'matches' \|\| e\.delivery\.state === 'mismatch'\) && e\.delivery\.url && \(/, 'the raw record repeats the brief, so it is linked only when the brief is shown');
});

test('only jobs Pokter commissioned have a page, read from the escrow, and anything else is a 404', () => {
  const loader = code('lib/jobs/evidence.ts');
  assert.match(loader, /const indexed = indexedJob\(chainId, jobId\);\n  if \(!indexed\) return null;/);
  assert.match(loader, /getErc8183Job\(altanaNetworkFor\(chainId\), BigInt\(jobId\)\)/, 'the escrow is the authority for state and parties');
  assert.match(loader, /readDeliveryText\(chainId, jobId, /, 'the delivery is read as the buyer’s job page reads it');
  const page = code('app/(site)/jobs/[chainId]/[jobId]/page.tsx');
  assert.match(page, /if \(!e\) notFound\(\);/);
  assert.match(page, /alternates: \{ canonical: jobEvidencePath\(e\) \}/);
  assert.match(page, /export const revalidate = 300;/);
  /* Only the not-found answer is kept out of search; a found job is indexable. */
  assert.equal((page.match(/index: false/g) ?? []).length, 1);
  assert.match(page, /if \(!e\) return \{ title: 'Job not found', robots: \{ index: false \} \};/);
  assert.match(page, /A match says the record was not changed after delivery\. It does not say the answer is right\./);
});

test('a funding time recorded after the delivery is not shown as the funding time', () => {
  assert.equal(fundedWhen('2026-10-14T01:19:00Z', '2026-10-13T22:46:00Z'), 'Before it was delivered. Pokter recorded the job later, 14 Oct 2026, 01:19 UTC.');
  assert.equal(fundedWhen('2026-10-26T20:38:58Z', '2026-10-26T20:39:00Z'), '26 Oct 2026, 20:38 UTC, as Pokter recorded it');
  assert.equal(fundedWhen('not a date', null), 'Not recorded');
});

test('states are said for any reader, and a delivery is one the escrow records', () => {
  assert.equal(jobStatusWords('COMPLETED').label, 'Completed, agent paid');
  /* The escrow paid Pokter's courier, not the agent: never "agent paid". */
  assert.equal(jobStatusWords('COMPLETED', true).label, 'Completed, paid to Pokter’s courier');
  assert.match(jobStatusWords('COMPLETED', true).meaning, /The agent was not paid by this escrow\./);
  assert.equal(jobStatusWords('EXPIRED', true).label, jobStatusWords('EXPIRED').label, 'only a settled job was paid');
  assert.equal(jobStatusWords('SOMETHING').label, 'SOMETHING');
  assert.deepEqual(['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED'].filter(wasDelivered), ['SUBMITTED', 'COMPLETED', 'REJECTED']);
  assert.equal(jobEvidencePath({ chainId: 56, jobId: '57097' }), '/jobs/56/57097');
});

test('the page is linked wherever a job is named: receipts, job_status, agent pages, the workspace, the sitemap and llms.txt', () => {
  assert.match(code('app/api/v1/receipts/route.ts'), /page: `\$\{origin\}\$\{jobEvidencePath\(job\)\}`/);
  assert.match(code('app/api/mcp/route.ts'), /const evidencePage = record \? `\$\{origin\}\$\{jobEvidencePath\(\{ chainId: escrow, jobId: job \}\)\}` : null;/);
  assert.match(code('app/(site)/agents/[chainId]/[tokenId]/page.tsx'), /<Link href=\{jobEvidencePath\(job\)\}/);
  assert.match(code('features/workspace/JobDetail.tsx'), /<Link href=\{jobEvidencePath\(job\)\}/);
  assert.match(code('app/sitemap.ts'), /\.filter\(\(job\) => wasDelivered\(job\.status\)\)/);
  assert.match(code('app/llms.txt/route.ts'), /\[Job evidence\]\(\$\{base\}\/jobs\/\{chainId\}\/\{jobId\}\)/);
});

test('an answer is shown in full, with the buyer’s own address taken out unless it is Pokter’s test', () => {
  const buyer = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
  const token = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';
  const text = `{"wallet":"${buyer.toLowerCase()}","healthFactor":1.48,"token":"${token}","note":"for ${buyer}"}`;
  const shown = publishableAnswerText(text, 'outside', buyer);
  assert.equal(shown, `{"wallet":"${BUYER_WALLET}","healthFactor":1.48,"token":"${token}","note":"for ${BUYER_WALLET}"}`, 'every casing, and nothing else');
  assert.doesNotThrow(() => JSON.parse(shown), 'still the same JSON');
  assert.equal(publishableAnswerText(text, 'self', buyer), shown);
  assert.equal(publishableAnswerText(text, 'team', buyer), text, 'Pokter’s own test shows what it sent');
  assert.equal(publishableAnswerText(text, 'outside', null), text);
  /* Applied wherever an answer is shown; the hash is checked on the original bytes. */
  assert.match(code('lib/jobs/evidence.ts'), /readDeliveredAnswer\(publishableAnswerText\(read\.text, funder, chain\.client\)\)/);
});

test('a courier job says the escrow pays Pokter’s courier, and a Pokter-owned agent is not called a courier', () => {
  const evidence = code('lib/jobs/evidence.ts');
  assert.match(evidence, /const paidToCourier = deliveredByPokter && !\(agentWallet\?\.answered && agentWallet\.wallet\?\.toLowerCase\(\) === provider\.toLowerCase\(\)\);/);
  const page = code('app/(site)/jobs/[chainId]/[jobId]/page.tsx');
  assert.equal(page.match(/jobStatusWords\(e\.status, e\.paidToCourier\)/g)?.length, 2, 'the headline and the status say the same');
  assert.match(page, /payable to Pokter’s courier <Readout>\{e\.provider\}<\/Readout> only after it delivers\./);
  assert.match(page, /Pokter’s courier submitted the delivery/);
  assert.doesNotMatch(page, /not from the agent’s own wallet/, 'a Pokter-owned agent’s wallet is its own');
  const proof = code('app/(site)/proof/page.tsx');
  assert.equal(proof.match(/summarizeProductionProof\(/g)?.length, proof.match(/isLifecycleDemo, paidToPokter\)/g)?.length, 'every summary on the page');
  assert.match(proof, /label="Via Pokter courier"/);
  assert.match(proof, /Via Pokter courier\{job\.status === 'COMPLETED' \? ': paid to Pokter' : ''\}/);
  assert.match(code('lib/erc8183/outside-activity.ts'), /answered: answeredAtAll\.length - viaCourier, viaCourier/);
  assert.match(code('features/home/data.ts'), /const answered = completedOutside\.length - demos - selfHires - courier;/);
});
