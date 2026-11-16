import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/*
 * The sweep runs every ten minutes and the reviewer step's slice changes
 * hourly, so each agent's feedback page, which can run to megabytes, was
 * downloaded six times an hour. It is read at most once a day now, and a read
 * that failed is tried again on the next pass.
 */

process.env.NODEREAL_API_KEY = 'test-key';
process.env.FUNDER_DB_PATH = join(mkdtempSync(join(tmpdir(), 'pokter-reviewers-')), 'funders.db');

const { refreshReviewerFunders, resetReviewerReads, REVIEWERS_FRESH_MS } = await import('../../src/lib/proof/reviewer-funders');

const agents = ['a', 'b', 'c'].map((id, i) => ({ chain_id: 56, token_id: String(i + 1), id, owner_address: null, total_feedbacks: 3 }));
const T = Date.parse('2026-11-16T16:00:00Z');

function lister(fail: ReadonlySet<string> = new Set()) {
  const asked: string[] = [];
  const list = (async ({ agentId }: { agentId?: string }) => {
    asked.push(agentId ?? '');
    if (fail.has(agentId ?? '')) throw new Error('8004scan timed out');
    return { items: [], total: 0, limit: 50, offset: 0 };
  }) as never;
  return { list, asked };
}

test('each agent’s reviewers are read at most once a day, whatever the sweep cadence', async () => {
  resetReviewerReads();
  const first = lister();
  assert.deepEqual(await refreshReviewerFunders(agents, { now: T, list: first.list }), { enabled: true, agents: 3, skipped: 0, looked: 0, found: 0 });
  assert.deepEqual(first.asked, ['a', 'b', 'c']);

  for (const minutes of [10, 20, 30, 60 * 23]) {
    const later = lister();
    const result = await refreshReviewerFunders(agents, { now: T + minutes * 60_000, list: later.list });
    assert.deepEqual(later.asked, [], `nothing read again ${minutes} minutes later`);
    assert.equal(result?.skipped, 3);
  }

  const nextDay = lister();
  await refreshReviewerFunders(agents, { now: T + REVIEWERS_FRESH_MS, list: nextDay.list });
  assert.deepEqual(nextDay.asked, ['a', 'b', 'c'], 'read again once the day has passed');
});

test('a read that failed is tried again on the next pass', async () => {
  resetReviewerReads();
  const failing = lister(new Set(['b']));
  await refreshReviewerFunders(agents, { now: T, list: failing.list });
  const next = lister();
  const result = await refreshReviewerFunders(agents, { now: T + 10 * 60_000, list: next.list });
  assert.deepEqual(next.asked, ['b']);
  assert.equal(result?.skipped, 2);
});
