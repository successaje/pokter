import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/*
 * The reliability charts on an agent's profile: the daily answer-rate bars
 * and the reply-time line take the column they sit in.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the reply-time line stretches to its column instead of keeping its aspect ratio', () => {
  const chart = code('features/studio/OpsCharts.tsx');
  const trend = chart.slice(chart.indexOf('export function LatencyTrend'), chart.indexOf('export function ProbeLog'));
  assert.match(trend, /preserveAspectRatio="none"/, 'kept, a 400-wide drawing came out 444px wide in a 760px column');
  assert.match(trend, /style=\{\{ height \}\}/);
  // A circle stretches with the drawing, so the hover dot is HTML.
  assert.doesNotMatch(trend, /<circle/);
  assert.match(trend, /rounded-full border-2 border-raised bg-ink/);
});

test('the profile draws the daily bars to the height of their container', () => {
  const page = code('app/(site)/agents/[chainId]/[tokenId]/page.tsx');
  assert.match(page, /<ProbeStrip cells=\{p\.record\.cells\} scale=\{80\} className="h-20 /, 'a full day fills the 80px strip');
  assert.match(page, /<LatencyTrend points=\{p\.latency\} height=\{160\} \/>/);
  // Elsewhere the strip keeps its 24px day.
  assert.match(code('ui/Agent.tsx'), /scale = 24 \}/);
});
