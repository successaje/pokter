import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { readinessRows, type ReadinessInput } from '../src/lib/agents/readiness';
import { ago, endpointReading } from '../src/lib/compare/rows';

/*
 * Each sweep checks a share of the roster, so freshness is said per agent:
 * when Pokter's scheduled sweeps last called this one, and what came back.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-28T20:00:00.000Z');
const input: ReadinessInput = {
  now: NOW,
  live: { answered: true, medianMs: 800 },
  record: { totalProbes: 40, totalAnswered: 38, observedDays: 6.2, lastSeen: '2026-10-28T19:48:00.000Z' },
  quote: null,
  escrowLabel: 'BNB Testnet',
  history: { jobs: 0, selfDelivered: 0, operatorDelivered: 0, relayedDelivered: 0 },
  categoryCheck: null,
};

test('the scheduled checks row says when the last one ran and what it found', () => {
  const answered = endpointReading({ ok: true, latencyMs: 878, protocol: 'a2a', detail: '' });
  const silent = endpointReading({ ok: false, latencyMs: null, protocol: 'mcp', detail: 'Timed out after 10s. The endpoint did not respond.' });
  assert.equal(answered, 'Answered in 878 ms over A2A');
  assert.equal(silent, 'Did not answer over MCP: Timed out after 10s');
  assert.equal(endpointReading({ ok: false, latencyMs: null, protocol: 'mcp', detail: 'no answer' }), 'Did not answer over MCP', 'a detail that only repeats it is dropped');
  const row = (lastCheck: ReadinessInput['lastCheck']) => readinessRows({ ...input, lastCheck }).find((r) => r.id === 'history')!.detail;
  assert.equal(row({ at: '2026-10-28T19:48:00.000Z', reading: answered }), 'Over 6 observed days; last checked 12 min ago: answered in 878 ms over A2A.');
  assert.equal(row({ at: '2026-10-28T17:00:00.000Z', reading: silent }), 'Over 6 observed days; last checked 3 h ago: did not answer over MCP: Timed out after 10s.');
  assert.equal(row(undefined), 'Over 6 observed days, last 12 min ago.', 'without the reading it says what it said before');
});

test('the overview carries the last check under the figures, per agent', () => {
  assert.equal(ago('2026-10-28T19:59:30.000Z', NOW), 'Just now');
  const page = code('app/(site)/agents/[chainId]/[tokenId]/page.tsx');
  assert.match(page, /<HeadlineStats p=\{p\} \/>\s*<LastCheck p=\{p\} \/>/);
  assert.match(page, /Last checked <time dateTime=\{p\.lastCheck\.at\}>\{ago\(p\.lastCheck\.at\)\.replace\('Just now', 'just now'\)\}<\/time>: \{p\.lastCheck\.reading\.charAt\(0\)\.toLowerCase\(\)\}\{p\.lastCheck\.reading\.slice\(1\)\}\./);
  assert.match(page, /Not reached by a scheduled check yet\./);
  assert.match(code('features/agent/profile.ts'), /lastCheck: d\.latestCheck \? \{ at: d\.latestCheck\.probedAt, reading: endpointReading\(d\.latestCheck\), answered: d\.latestCheck\.ok \} : null,/);
  assert.match(code('lib/marketplace.ts'), /const latestCheck = probes\.reduce<ProbeRecord \| null>/);
  assert.match(code('app/(site)/agents/[chainId]/[tokenId]/page.tsx'), /title = 'Pokter’s scheduled sweeps check a share of all agents each time, so each agent has its own last check\.'/);
});
