import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { checkTone, distinctPercents } from '../src/lib/compare/rows';
import { closingDate } from '../src/features/briefs/RequestTerms';
import { jobTimeline } from '../src/lib/jobs/timeline';
import { computeCost, GAS_PER_REBALANCE_USD } from '../src/lib/pancakeswap/cost';
import { AVAILABILITY_LABEL, VERDICT_LABEL } from '../src/lib/proof/engine';

/*
 * Wording and figures that said more, or other, than the code does. Each
 * test pins a correction an outside review found: availability read as
 * correctness, a tie marked Best, a break-even without the agent's fee,
 * a delivered job's first step "pending", privacy and support claims the
 * implementation had outgrown.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
/** What a page says, without the comments that record what it used to say. */
const said = (path: string) => code(path).replace(/\/\*[\s\S]*?\*\//g, '');

test('availability is said as replies, never as a verdict on the answers; the API keeps its vocabulary', () => {
  assert.equal(AVAILABILITY_LABEL.reliable, 'Replies reliably');
  for (const label of Object.values(AVAILABILITY_LABEL).filter((l) => l !== 'Not measured' && l !== 'Too early to judge')) assert.match(label, /^Replies/);
  assert.equal(VERDICT_LABEL.reliable, 'Reliable', 'verdictLabel in the API is unchanged');
  const view = code('features/compare/CompareView.tsx');
  assert.match(view, /label: 'Availability', hint: 'Whether it replies to Pokter’s probes'/);
  assert.match(view, /label: 'Correctness', hint: 'Whether its answers match what Pokter reads on chain'/);
  assert.match(view, /deliveryAdjustedVerdict\(c\.proof\.verdict, c\.economicHistory\)/, 'the same demotion as the agent page');
  assert.match(code('ui/Verdict.tsx'), /\{AVAILABILITY_LABEL\[verdict\]\}/);
});

test('correctness is marked as plainly as availability: a pass, a failure, or neither', () => {
  assert.equal(checkTone({ passed: 3, total: 3, status: 'checked' }), 'pass');
  assert.equal(checkTone({ passed: 0, total: 3, status: 'checked' }), 'fail');
  assert.equal(checkTone({ passed: 2, total: 3, status: 'checked' }), 'fail');
  assert.equal(checkTone({ passed: 0, total: 3, status: 'not-askable' }), 'none');
  assert.equal(checkTone(null), 'none');
});

test('rates are shown with enough precision to tell them apart, and a displayed tie is a tie', () => {
  assert.deepEqual(distinctPercents([0.994, 0.986]).labels, ['99.4%', '98.6%']);
  assert.deepEqual(distinctPercents([0.99, 0.95]).labels, ['99%', '95%'], 'whole percents when they already differ');
  const tie = distinctPercents([0.99001, 0.99002]);
  assert.equal(tie.labels[0], tie.labels[1]);
  assert.equal(tie.ranked[0], tie.ranked[1], 'the same rank where they read the same');
  assert.deepEqual(distinctPercents([null, 0.5]).labels, [null, '50%']);
});

test('the break-even includes the agent’s own price, counted at $1, and says what it assumes', () => {
  const pool = { pairId: 'wbnb-usdt' as never, label: 'WBNB / USDT', address: '0x0000000000000000000000000000000000000001' as const, feeTier: 500, tick: 0, sqrtPriceX96: (2n ** 96n).toString(), liquidity: (10n ** 24n).toString(), quoteIsToken0: false, quoteDecimals: 18, quoteUsdPrice: 1, readAt: '2026-10-27T00:00:00Z' };
  const without = computeCost({ pool, positionUsd: 10_000, rebalancesPerMonth: 4, agentFeeU: 0, turnoverPerRebalance: 0.25 });
  const withFee = computeCost({ pool, positionUsd: 10_000, rebalancesPerMonth: 4, agentFeeU: 0.5, turnoverPerRebalance: 0.25 });
  assert.equal(withFee.agentFeesUsd, 2);
  assert.equal(withFee.totalCostUsd, withFee.onchainCostUsd + 2);
  assert.ok(Math.abs(withFee.breakEvenApr - without.breakEvenApr - (2 * 12) / 10_000) < 1e-12, 'the fee moves the break-even');
  assert.equal(GAS_PER_REBALANCE_USD, 0.35);
  const ui = code('features/pool/PoolCheck.tsx');
  assert.match(ui, /Assumptions: pool fees and price impact are read from the pool now; gas is an estimate/);
  assert.match(ui, /Starts at an example of \$0\.10/);
});

test('a delivered job’s first step is on chain, with its link said to be unavailable, not pending', () => {
  const job = { id: 'x', jobId: '1', chainId: 56, isTestnet: false, agentTokenId: '1', agentName: 'A', provider: '0x0000000000000000000000000000000000000001', task: 't', budgetRaw: '1', expiredAt: '2026-11-01T00:00:00Z', hiredAt: '2026-10-01T00:00:00Z', hireTxHash: null, status: 'SUBMITTED', statusCheckedAt: '2026-10-01T00:00:00Z', deliverableUrl: null, settleTxHash: null } as const;
  const created = jobTimeline(job as never)[0];
  assert.equal(created.source, 'onchain');
  assert.match(created.detail, /^Transaction link unavailable\./);
  assert.equal(jobTimeline({ ...job, status: 'OPEN' } as never)[0].source, 'pending');
});

test('proposal deadlines are said to the minute, in UTC', () => {
  assert.equal(closingDate('2026-10-31T16:07:42.365Z'), '31 Oct 2026, 16:07 UTC');
});

test('a failed load is never shown as nothing, and the delivered file survives a failed summary', () => {
  assert.match(code('features/workspace/hooks.ts'), /if \(!response\.ok\) throw new Error/);
  const jobs = code('features/workspace/Pages.tsx');
  assert.match(jobs, /failed && jobs\.length === 0 \? \(\s*<EmptyState tone="bad" title="Your jobs could not be loaded"/);
  assert.ok(jobs.indexOf('Your jobs could not be loaded') < jobs.indexOf("'No jobs yet'"), 'failure is checked before empty');
  const answer = code('features/workspace/JobAnswer.tsx');
  const failed = answer.slice(answer.indexOf('if (query.isError) {'), answer.indexOf("if (!data || !data.delivered)"));
  assert.match(failed, /Open the delivered file/);
  assert.match(failed, /Check it against the chain/);
});

test('privacy and support say what the code does', () => {
  const privacy = said('app/(site)/(legal)/privacy/page.tsx');
  assert.doesNotMatch(privacy, /never reaches a Pokter server|twelve hours|task reference/);
  assert.match(privacy, /lasts seven days or until you sign out/);
  assert.match(privacy, /the brief you wrote/);
  assert.match(privacy, /receives your brief at its own endpoint/);
  assert.match(privacy, /The agent&rsquo;s answer is shown there only if you publish it from your job page/);
  assert.match(privacy, /the link to its answer is written there too, so anyone who looks it up can read the answer, whether or not Pokter shows it/);
  const support = said('app/(site)/support/page.tsx');
  assert.doesNotMatch(support, /nobody who compromised Pokter could take your funds|Job memory lives in the browser|Why is there no star rating/);
  assert.match(support, /It does not protect what you sign\./);
  const methodology = said('app/(site)/methodology/page.tsx');
  assert.doesNotMatch(methodology, /signs its price in mainnet \$U|There are no star ratings/);
  assert.match(methodology, /moneyWords\(56\)/);
});

test('one name for the hiring pages, and a quoted curl', () => {
  assert.match(code('shell/SiteFooter.tsx'), /\{ href: '\/workspace', label: 'Hiring' \}/);
  assert.doesNotMatch(code('app/(site)/how-it-works/page.tsx'), /Your workspace/);
  assert.match(code('app/(site)/developers/page.tsx'), /curl 'https:\/\/pokter\.xyz\/api\/v1\/agents\?category=health-factor&q=has:price'/);
});

test('Proof counts delivered work under review apart from settled work, and every job links to its own page', () => {
  const proof = said('app/(site)/proof/page.tsx');
  assert.match(proof, /label="Settled with an answer"/);
  assert.match(proof, /label="Delivered, in review"/);
  assert.match(proof, /href=\{jobEvidencePath\(job\)\}[^>]*>Job page</);
  assert.match(code('lib/erc8183/production-proof.ts'), /inReview: byStatus\.SUBMITTED/);
});
