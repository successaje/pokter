import assert from 'node:assert/strict';
import test from 'node:test';

import { agentReadings, median, MIN_AGENTS, platformBenchmark, type BenchmarkInput } from '../src/lib/benchmark/platform';

const agent = (o: { probes?: number; answered?: number; ms?: number | null; completed?: number; missed?: number; noHistory?: boolean }): BenchmarkInput => ({
  record: { totalProbes: o.probes ?? 20, totalAnswered: o.answered ?? 20, windows: [{ label: '30d', medianMs: o.ms === undefined ? 800 : o.ms }] },
  history: o.noHistory ? undefined : { completed: o.completed ?? 0, missed: o.missed ?? 0 },
});

test('median of an odd and an even list', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('each figure is the median of agents that have the reading, with how many there are', () => {
  const entries = [
    agent({ answered: 20, ms: 500, completed: 1, missed: 0 }),
    agent({ answered: 10, ms: 900, completed: 1, missed: 1 }),
    agent({ answered: 15, ms: 700, completed: 0, missed: 1 }),
    agent({ answered: 0, ms: null, completed: 2, missed: 0 }),
    agent({ answered: 18, ms: 600 }),
    agent({ answered: 19, ms: 1000, completed: 3, missed: 1 }),
    agent({ answered: 17, ms: 800, completed: 1, missed: 0 }),
  ];
  const b = platformBenchmark(entries);
  assert.deepEqual(b.replyRate, { median: 0.85, agents: 7 });
  assert.deepEqual(b.replyMs, { median: 750, agents: 6 }, 'an agent with no answer in 30 days has no reply time');
  assert.deepEqual(b.settledRate, { median: 0.875, agents: 6 }, 'an agent with no finished job is left out: 0, 0.5, 0.75, 1, 1, 1');
});

test('a figure from fewer than the minimum number of agents is withheld', () => {
  const few = Array.from({ length: MIN_AGENTS - 1 }, () => agent({ completed: 1 }));
  assert.equal(platformBenchmark(few).settledRate, null);
  assert.equal(platformBenchmark(few).replyRate, null);
});

test('an agent Pokter has barely checked does not count towards the reply rate', () => {
  assert.equal(agentReadings(agent({ probes: 3, answered: 0 })).replyRate, null);
});

test('jobs still running are not finished, so they count neither way', () => {
  assert.equal(agentReadings(agent({ completed: 0, missed: 0 })).settledRate, null);
  assert.equal(agentReadings(agent({ noHistory: true })).settledRate, null);
});
