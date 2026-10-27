import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { briefIsPublic, FUNDER_LABEL, fundedWhen, jobEvidencePath, jobFunder, jobStatusWords, wasDelivered } from '../src/lib/jobs/evidence-view';

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

test('the brief and the answer are published only for Pokter’s own test jobs', () => {
  assert.equal(briefIsPublic('team'), true);
  for (const funder of ['self', 'outside', 'unknown'] as const) assert.equal(briefIsPublic(funder), false, funder);
  const loader = code('lib/jobs/evidence.ts');
  assert.match(loader, /brief: briefIsPublic\(funder\) \? indexed\.task : null/);
  assert.match(loader, /if \(matchedBy && briefIsPublic\(funder\)\) answer = readDeliveredAnswer\(read\.text\)/, 'and never an answer that fails its own hash');
  const page = code('app/(site)/jobs/[chainId]/[jobId]/page.tsx');
  assert.match(page, /e\.brief !== null \?/);
  assert.match(page, /What they asked and what came back is theirs, so it is not\s+published here\./);
  /* The buyer's address is never shown, as the receipts API never returns it. */
  assert.doesNotMatch(page, /\.client\b/);
  assert.match(page, /e\.delivery\.url && \(/, 'the delivered record is linked only inside the published branch');
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
