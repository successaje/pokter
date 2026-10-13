import assert from 'node:assert/strict';
import test from 'node:test';

import { dueForCheck } from '../src/lib/assay/queue';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const opts = { now: NOW, recheckMs: 3 * 86_400_000, retryMs: 12 * 3_600_000, limit: 2 };
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
const a = (tokenId: string) => ({ chainId: 56, tokenId });

test('agents that keep failing no longer block the rest of the queue', () => {
  // The real case: two never-checked agents failed every sweep, so 269228 was never reached.
  const agents = [a('broken-1'), a('broken-2'), a('269228')];
  const history = {
    lastRun: new Map<string, string>(),
    lastAttempt: new Map([['56:broken-1', at(2)], ['56:broken-2', at(2)]]),
  };
  assert.deepEqual(dueForCheck(agents, history, opts).map((x) => x.tokenId), ['269228']);
});

test('a failed agent is tried again after the retry wait, behind never-tried agents', () => {
  const agents = [a('failed'), a('fresh')];
  const history = { lastRun: new Map<string, string>(), lastAttempt: new Map([['56:failed', at(13)]]) };
  assert.deepEqual(dueForCheck(agents, history, opts).map((x) => x.tokenId), ['fresh', 'failed']);
});

test('a recent result is not rechecked; an old one is, oldest first', () => {
  const agents = [a('recent'), a('old'), a('older')];
  const history = {
    lastRun: new Map([['56:recent', at(5)], ['56:old', at(80)], ['56:older', at(100)]]),
    lastAttempt: new Map<string, string>(),
  };
  assert.deepEqual(dueForCheck(agents, history, opts).map((x) => x.tokenId), ['older', 'old']);
});
