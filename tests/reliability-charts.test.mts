import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CATEGORIES } from '../src/lib/agents/categories';
import { assayForCategory } from '../src/lib/assay/catalog';

/*
 * The Evidence tab on an agent's profile: what is verified comes before how
 * often the agent answers, and the reliability charts take the column they
 * sit in.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const page = code('app/(site)/agents/[chainId]/[tokenId]/page.tsx');

test('the Evidence tab says what is verified before how often the agent answers', () => {
  const panel = page.slice(page.indexOf('<AgentTabPanel id="evidence">'), page.indexOf('<AgentTabPanel id="work">'));
  const order = ['<EvidenceSummary p={p} comparison={checkComparison} />', '<Reliability p={p} />', 'Evidence in detail', 'How it is measured, and where that falls short'];
  const at = order.map((marker) => panel.indexOf(marker));
  assert.ok(at.every((i) => i >= 0), 'every section is in the tab');
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in that order');
  assert.ok(panel.indexOf('id="answer-check"') > panel.indexOf('Evidence in detail'), 'the full comparison sits with the evidence in detail');
});

test('a check never stands without what it leaves unverified', () => {
  for (const { id } of CATEGORIES) {
    const definition = assayForCategory(id);
    if (definition) assert.ok(definition.unverified.length > 10, `${id} says what a pass leaves unchecked`);
  }
  const summary = page.slice(page.indexOf('function EvidenceSummary'), page.indexOf('const STRIP_LEGEND'));
  assert.match(summary, /Not verified/);
  assert.match(summary, /check\.definition\.unverified/);
  assert.match(summary, /Pokter does not measure returns/);
});

test('the daily bars lead, empty days read as empty, and the reply-time line stays small', () => {
  assert.match(page, /<ProbeStrip cells=\{record\.cells\} scale=\{80\} empty="slot" className="h-20 /, 'a full day fills the 80px strip');
  assert.match(page, /\{ id: 'none', label: 'Not probed'/, 'the legend names the empty slot');
  assert.match(page, /<LatencyTrend points=\{p\.latency\} height=\{72\} \/>/);
  // Elsewhere the strip keeps its 24px day and its baseline tick.
  assert.match(code('ui/Agent.tsx'), /scale = 24, empty = 'tick' \}/);
});

test('the reply-time line stretches to its column instead of keeping its aspect ratio', () => {
  const chart = code('features/studio/OpsCharts.tsx');
  const trend = chart.slice(chart.indexOf('export function LatencyTrend'), chart.indexOf('export function ProbeLog'));
  assert.match(trend, /preserveAspectRatio="none"/, 'kept, a 400-wide drawing came out 444px wide in a 760px column');
  assert.match(trend, /style=\{\{ height \}\}/);
  // A circle stretches with the drawing, so the hover dot is HTML.
  assert.doesNotMatch(trend, /<circle/);
  assert.match(trend, /rounded-full border-2 border-raised bg-ink/);
});
