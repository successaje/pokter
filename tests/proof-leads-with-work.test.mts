import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * The proof page opens with the work: jobs, answers delivered and agents
 * hired on one network, with the funding split beside the total, then what
 * agents delivered. Settlement and the stricter accounting follow, and the
 * full record keeps every outcome.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const page = code('app/(site)/proof/page.tsx');

test('the page reads one network at a time, BNB Chain unless chosen, with every funder by default', () => {
  assert.match(page, /type Network = 'mainnet' \| 'testnet';/);
  assert.match(page, /funder: funder === 'team' \|\| funder === 'outside-team' \? funder : 'all',/);
  assert.match(page, /parsed\.network \?\? \(counts\.mainnet === 0 && counts\.testnet > 0 \? 'testnet' : 'mainnet'\)/);
  assert.match(page, /\{ value: 'all', label: 'All activity' \}, \{ value: 'outside-team', label: 'Outside-team' \}, \{ value: 'team', label: 'Pokter team' \}/);
});

test('three headline figures lead, the funding split beside the total', () => {
  const headlines = page.slice(page.indexOf('<Headline value={summary.jobs}'), page.indexOf('</section>', page.indexOf('<Headline value={summary.jobs}')));
  assert.match(headlines, /label=\{`\$\{word\} jobs`\} note=\{split\}/);
  assert.match(headlines, /label="Answers delivered" note=\{`\$\{summary\.answersSettled\} settled · \$\{summary\.answersAwaitingSettlement\} awaiting settlement`\}/);
  assert.match(headlines, /label="Agents hired"/);
  assert.match(page, /`\$\{outsideTeamJobs\} outside-team · \$\{teamFundedJobs\} team-funded`/);
  assert.ok(page.indexOf('id="results-title"') < page.indexOf('id="settlement-title"'), 'what agents delivered comes before settlement');
  assert.ok(page.indexOf('id="settlement-title"') < page.indexOf('id="receipts-title"'));
});

test('outside-team results come first, and a buyer’s brief and unpublished answer stay private', () => {
  assert.ok(page.indexOf("title: 'Funded outside the team'") < page.indexOf("title: 'Funded by Pokter’s team'"));
  assert.match(page, /briefIsPublic\(funder\) \? job\.task\.replace/);
  assert.match(page, /const answerShown = answerIsPublic\(funder, store\.answerPublication\(job\.chainId, job\.jobId\)\);/);
  assert.match(page, /\{answerShown \? 'View answer' : 'Job page'\}/);
  assert.match(page, /\(job\.status === 'SUBMITTED' \|\| job\.status === 'COMPLETED'\) && !isLifecycleDemo\(job\)/);
});

test('settled value keeps each currency on its own line', () => {
  assert.match(page, /const settledValue = summary\.completedByToken\.map\(/);
  assert.match(page, /Each currency on its own line, never added together\./);
});
