import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { LEADERBOARD_METHOD } from '../src/lib/leaderboard/method';
import { ANSWER_RATE_DOES_NOT_MEAN } from '../src/lib/leaderboard/responsiveness';
import { COMPONENT_WEIGHTS } from '../src/lib/score/track-record';

/*
 * One name, one figure. The methodology called two different scores "The
 * Pokter Score", said the leaderboard had no overall score beside the 60/40
 * description of the one it has, called the probe record Reliability two
 * sections after saying the answer rate is not reliability, and the terms
 * said two dimensions were never measured after one of them started to be.
 */

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const method = JSON.stringify(LEADERBOARD_METHOD);

test('the methodology no longer says there is no overall score beside the score it describes', () => {
  const methodology = source('src/app/(site)/methodology/page.tsx');
  assert.match(method, new RegExp(`\\(${COMPONENT_WEIGHTS.delivery} points, out of its paid jobs`), 'the 60/40 description is still published');
  for (const text of [method, methodology]) {
    assert.doesNotMatch(text, /There is no overall score/);
    assert.doesNotMatch(text, /Nothing is combined into a single rank/);
    assert.doesNotMatch(text, /no honest weight exists/);
  }
  /* The board ranks across categories and a category narrows that order (`rankTrackRecords`, `loadScoreBoard`). */
  assert.doesNotMatch(method, /Agents are ranked inside their category/);
});

test('the leaderboard’s Pokter Score and the profile score are two names, each saying which it is not', () => {
  const methodology = source('src/app/(site)/methodology/page.tsx');
  assert.equal((methodology.match(/title="The Pokter Score"/g) ?? []).length, 0, 'the five-dimension section no longer takes the leaderboard’s name');
  assert.match(methodology, /<DocSection id="score" title="The profile score">/);
  assert.match(methodology, /\{ id: 'score', label: 'The profile score' \}/);
  assert.match(methodology, /It is not the leaderboard&rsquo;s Pokter Score \(v\{POKTER_SCORE_VERSION\}/);
  assert.match(method, /It is not the profile score on an agent's own page/);

  const profile = source('src/app/(site)/agents/[chainId]/[tokenId]/page.tsx');
  assert.match(profile, /<dt className="[^"]*">\s*Profile score\{' '\}/);
  assert.doesNotMatch(profile, /<span className="t-label">Pokter Score<\/span>/);
});

test('reliability means the same thing on both pages', () => {
  const methodology = source('src/app/(site)/methodology/page.tsx');
  assert.match(ANSWER_RATE_DOES_NOT_MEAN, /not reliability at the work itself/);
  assert.match(methodology, /<strong>Reliability<\/strong> here means only that the endpoint replies when called/);
  assert.match(methodology, /not reliability at the work itself/);
  assert.doesNotMatch(methodology, /<strong>Reliability<\/strong> is whether it answers/);
});

test('the terms no longer say two of the five dimensions are never measured', () => {
  const terms = source('src/app/(site)/(legal)/terms/page.tsx');
  assert.doesNotMatch(terms, /Two of the five/);
  assert.match(terms, /Risk, one of the five dimensions of an agent&rsquo;s profile score, is\s+permanently reported as not measured/);
});

test('the leaderboard description counts its three tabs', () => {
  const board = source('src/app/(site)/leaderboard/page.tsx');
  assert.doesNotMatch(board, /Two separate boards per network/);
  assert.match(board, /'Three boards per network: the Pokter Score/);
});

test('the trial says why its button is disabled, beside it, while the task is too short', () => {
  const panel = source('src/features/agent/TrialPanel.tsx');
  assert.match(panel, /const MIN_TASK_LENGTH = 10;/);
  assert.match(panel, /const tooShort = task\.trim\(\)\.length < MIN_TASK_LENGTH;/, 'the guard is kept');
  assert.match(panel, /disabled=\{tooShort\} aria-describedby=\{TOO_SHORT_ID\}/, 'the button names its reason');
  assert.match(panel, /<p id=\{TOO_SHORT_ID\} aria-live="polite"/, 'the reason is announced as it appears');
  assert.match(panel, /\{tooShort \? `Describe the task in at least \$\{MIN_TASK_LENGTH\} characters\.` : null\}/);

  /* And the example it starts with is never itself too short to send. */
  const profile = source('src/app/(site)/agents/[chainId]/[tokenId]/page.tsx');
  assert.match(profile, /defaultTask=\{templates\[0\] && templates\[0\]\.task\.trim\(\)\.length >= 10 \? templates\[0\]\.task : 'Produce a read-only assessment\./);
});
