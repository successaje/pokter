import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * "How did the agent do?": the public review and the private answer side
 * by side, each saying who sees it, and a review that starts empty. Plus
 * the hire tracker, which sizes itself by the room it has.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('a review starts with nothing chosen, and cannot be signed until it is complete', () => {
  const form = code('features/workspace/ReviewForm.tsx');
  // It opened at five stars, delivered, on time, would hire again.
  assert.match(form, /useState<number \| null>\(null\)/);
  assert.match(form, /useState<'yes' \| 'no' \| null>\(null\);[\s\S]*useState<ReviewSpeed \| null>\(null\)/);
  assert.doesNotMatch(form, /useState\(5\)/);
  assert.match(form, /disabled=\{missing !== null\}/);
  assert.match(form, /'Choose a rating to continue\.'/);
  assert.match(form, /if \(rating === null \|\| promised === null \|\| speed === null \|\| again === null\) return;/);
});

test('the rating is stars that name their value, and each answer is a clear choice', () => {
  const form = code('features/workspace/ReviewForm.tsx');
  assert.match(form, /role="radiogroup" aria-label="Rating out of 5"/);
  assert.match(form, /aria-label=\{`\$\{v\} of 5, \$\{RATING_WORD\[v\]\}`\}/);
  assert.match(form, /\['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'\]/);
  // Filled, not a lighter chip: an answer about to be signed has to read at a glance.
  assert.match(form, /chosen \? 'bg-ink text-paper'/);
  for (const label of ['Delivered as promised', 'Delivery timing', 'Would you hire it again']) assert.match(form, new RegExp(`<Choice label="${label}"`));
});

test('each card says who sees it, and the two sit side by side once the job settles', () => {
  assert.match(code('features/workspace/ReviewForm.tsx'), /kind="Public review" icon=\{<Icon\.Globe/);
  const privateCard = code('features/workspace/UsefulnessQuestion.tsx');
  assert.match(privateCard, /kind="Private feedback" icon=\{<Icon\.Lock/);
  assert.match(privateCard, /Separate from your public review, and never shown on the agent&rsquo;s page\./);
  const page = code('features/workspace/JobDetail.tsx');
  assert.equal(page.match(/<section aria-labelledby="feedback-title"/g)?.length, 1, 'one section, not two');
  assert.match(page, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,21rem\)\]/);
  assert.ok(page.indexOf('<ReviewForm job={job} />') < page.indexOf('<UsefulnessQuestion job={job} />'), 'the public review leads');
});

test('the hire tracker sizes itself by its own width, so it fits the sheet', () => {
  const flow = code('features/hire/HireFlow.tsx');
  const tracker = flow.slice(flow.indexOf('function StepTracker'), flow.indexOf('function Shell'));
  assert.match(tracker, /<div className="@container">/);
  assert.match(tracker, /@\[44rem\]:hidden">\{current \? step\.label : step\.short\}/);
  assert.match(tracker, /'h-px min-w-3 flex-1 @\[44rem\]:w-10 @\[44rem\]:flex-none'/);
  assert.match(flow, /\{ id: 'pay', label: 'Fund escrow', short: 'Fund' \}/);
});
