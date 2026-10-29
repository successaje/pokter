import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { judgeStaticAnswer, needsSecondAsk, secondAskWins } from '../src/lib/assay/category-suites';

/*
 * A second ask, with the brief's structured part alone, for an answer the
 * check could not grade. Some agents parse the fields and not the prose: a
 * yield agent read "at least 0.5 points" as a market name and declined.
 */

const YIELD = { amount: 1000, asset: 'USDT', holding_days: 30, current_apr_pct: 0, threshold_pp: 0.5 };
const data = (d: Record<string, unknown>) => judgeStaticAnswer(YIELD, { text: null, data: d });
const prose = (text: string) => judgeStaticAnswer(YIELD, { text, data: null });

const unstated = data({ recommend: false, venue: null, declineReason: 'no USDT market on move it for at least 0' });
const unreadable = prose('The best yield is on Venus.');
const echoed = data({ ...YIELD, venue: 'Venus' });
const changed = data({ ...YIELD, asset: 'USDC' });

test('a second ask is made only when the first gave nothing to grade', () => {
  assert.equal(needsSecondAsk(unstated), true);
  assert.equal(needsSecondAsk(unreadable), true);
  assert.equal(needsSecondAsk(echoed), false, 'a pass is not asked again');
  assert.equal(needsSecondAsk(changed), false, 'nor is a wrong answer: asking until it is right is not a check');
});

test('an answer that states the terms replaces one that stated none', () => {
  assert.equal(secondAskWins(unstated, echoed), true);
  assert.equal(secondAskWins(unstated, changed), true, 'graded, and fails on its own terms');
});

test('a worse second reply never replaces a better first', () => {
  assert.equal(secondAskWins(unstated, unreadable), false, 'a readable reply is kept over an unreadable one');
  assert.equal(secondAskWins(unstated, unstated), false);
  assert.equal(secondAskWins(unstated, null), false, 'no second answer at all');
  assert.equal(secondAskWins(echoed, unstated), false);
});

test('an unreadable first answer takes any readable second one, as before', () => {
  assert.equal(secondAskWins(unreadable, unstated), true);
  assert.equal(secondAskWins(unreadable, echoed), true);
  assert.equal(secondAskWins(unreadable, unreadable), false);
});

test('the runner asks with the structured part only, and says when a grade came from it', () => {
  const run = readFileSync(new URL('../src/lib/assay/static-run.ts', import.meta.url), 'utf8');
  assert.match(run, /if \(needsSecondAsk\(verdict\)\) \{\s*const retry = await sendPreparedBrief\(agent, scenario\.brief, \{ timeoutMs: 12_000, dataOnly: true \}\)/);
  assert.match(run, /secondAskWins\(verdict, second\)/);
  assert.match(run, /Graded on a second ask that sent the brief’s terms as structured data only\./);
});
