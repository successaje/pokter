import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  advanceCursor,
  afterDiscoveryAttempt,
  declaresCallableProtocol,
  DISCOVERY_BACKOFF_MS,
  DISCOVERY_MAX_PAGES,
  DISCOVERY_OVERLAP_MS,
  DISCOVERY_QUOTA,
  newerThanCursor,
} from '../src/lib/history/discovery';

/*
 * New registrations, found incrementally: a cursor, a queue, a quota and a
 * backoff, never a scan of a registry of 360,000.
 */

const code = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const at = (minutes: number) => new Date(Date.parse('2026-10-27T20:00:00Z') + minutes * 60_000).toISOString();

test('only registrations declaring A2A or MCP are queued, however the registry spells them', () => {
  assert.equal(declaresCallableProtocol(['A2A']), true);
  assert.equal(declaresCallableProtocol(['Web', 'mcp']), true);
  assert.equal(declaresCallableProtocol(['Web']), false, 'most mainnet registrations: a website only');
  assert.equal(declaresCallableProtocol(null), false);
  assert.equal(declaresCallableProtocol([]), false);
});

test('a run reads what arrived since the cursor, with an overlap for late indexing, and starts from now on its first run', () => {
  const page = [{ created_at: at(30) }, { created_at: at(10) }, { created_at: at(-20) }, { created_at: at(-45) }];
  const first = newerThanCursor(page, null);
  assert.equal(first.fresh.length, 4, 'the first page only, no backfill');
  assert.equal(first.reachedCursor, true);
  const later = newerThanCursor(page, at(0));
  assert.deepEqual(later.fresh.map((i) => i.created_at), [at(30), at(10), at(-20)], 'within the overlap behind the cursor');
  assert.equal(later.reachedCursor, true, 'it reached past the window, so no further page');
  const busy = newerThanCursor([{ created_at: at(50) }, { created_at: at(40) }], at(0));
  assert.equal(busy.reachedCursor, false, 'a page all newer means read the next one');
  assert.equal(DISCOVERY_OVERLAP_MS, 30 * 60_000);
  assert.equal(advanceCursor(at(0), page), at(30));
  assert.equal(advanceCursor(at(60), page), at(60), 'never moves backwards');
  assert.equal(advanceCursor(null, []), null);
});

test('an agent that answers is promoted; one that does not is tried later and later, then left alone', () => {
  const now = Date.parse('2026-10-27T20:00:00Z');
  assert.deepEqual(afterDiscoveryAttempt(0, 'answered', now), { state: 'promoted', attempts: 1, nextAttemptAt: null });
  assert.deepEqual(afterDiscoveryAttempt(0, 'no-endpoint', now), { state: 'dropped', attempts: 1, nextAttemptAt: null });
  const waits: number[] = [];
  let attempts = 0;
  for (;;) {
    const next = afterDiscoveryAttempt(attempts, 'no-answer', now);
    attempts = next.attempts;
    if (next.state === 'dropped') break;
    waits.push((Date.parse(next.nextAttemptAt!) - now) / 3_600_000);
  }
  assert.deepEqual(waits, [1, 6, 24, 72, 168, 168, 168]);
  assert.equal(attempts, DISCOVERY_BACKOFF_MS.length + 1, 'dropped on the try after the last wait');
  const days = DISCOVERY_BACKOFF_MS.reduce((sum, ms) => sum + ms, 0) / 86_400_000;
  assert.ok(days > 24 && days < 30, `about four weeks (${days.toFixed(1)} days)`);
});

test('the pass is bounded, keeps its tries out of the probe history, and runs late in the sweep', () => {
  assert.equal(DISCOVERY_MAX_PAGES, 3);
  assert.equal(DISCOVERY_QUOTA, 6);
  const sweep = code('lib/history/sweep.ts');
  const pass = sweep.slice(sweep.indexOf('export async function runDiscovery'));
  assert.doesNotMatch(pass, /store\.record\(/, 'a discovery try never enters the probe history, so silence does not join the roster');
  assert.match(sweep, /\.\.\.store\.discoveredAgents\(\)\.filter\(onThisChain\),/, 'an answering agent does');
  assert.match(pass, /if \(!timeLeft\(\)\) \{\s*outcome\.unreached \+= 1;/);
  const route = code('app/api/sweep/route.ts');
  assert.match(route, /budget\.step\(\s*'discovery',/);
  assert.ok(route.indexOf("budget.step(\n      'discovery'") > route.indexOf("budget.step('stuckJobs'"), 'after the steps that alert anyone');
  assert.match(code('lib/history/scheduler.ts'), / · discovery /);
  assert.match(code('app/(site)/methodology/page.tsx'), /New registrations are found as they arrive, not by scanning the registry\./);
});
