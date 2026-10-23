import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTrackRecord } from '../src/lib/history/record';

/* Derived from the function's own signature rather than imported: the
   `ProbeRecord` type lives in the `server-only` probe store, which a test
   cannot import. */
type Probe = Parameters<typeof buildTrackRecord>[0][number];
import type { BoardAgent } from '../src/lib/leaderboard/network';
import {
  ANSWER_RATE_COLUMN,
  ANSWER_RATE_DOES_NOT_MEAN,
  ANSWER_RATE_MEANS,
  buildResponsivenessBoard,
  MIN_RESPONSIVENESS_CHECKS,
  RESPONSIVENESS_WINDOW_DAYS,
  RESPONSIVENESS_WINDOW_LABEL,
  sortResponsivenessRows,
  toResponsivenessRow,
  windowOf,
  type ResponsivenessInput,
  type ResponsivenessRow,
} from '../src/lib/leaderboard/responsiveness';

const NOW = new Date('2026-10-23T12:00:00.000Z');

function probe(daysAgo: number, ok: boolean): Probe {
  return {
    chainId: 97,
    tokenId: '2618',
    endpoint: 'https://agent.example/a2a',
    protocol: 'a2a',
    ok,
    latencyMs: ok ? 420 : null,
    status: ok ? 200 : 504,
    detail: ok ? 'A2A capability handshake succeeded.' : 'Timed out.',
    probedAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  };
}

function agent(overrides: Partial<BoardAgent> = {}): BoardAgent {
  return {
    key: '97:2618',
    chainId: 97,
    tokenId: '2618',
    name: 'Nagi',
    imageUrl: null,
    category: 'yield',
    owner: null,
    ...overrides,
  };
}

function input(probes: Probe[], overrides: Partial<ResponsivenessInput> = {}): ResponsivenessInput {
  const record = buildTrackRecord(probes, NOW);
  return {
    agent: agent(),
    protocol: 'a2a',
    windows: record.windows,
    lastSeen: record.lastSeen,
    ...overrides,
  };
}

function manyProbes(total: number, answered: number, daysAgo = 5): Probe[] {
  return Array.from({ length: total }, (_, i) => probe(daysAgo, i < answered));
}

/*
 * The column has to name its own window, because a cumulative rate silently
 * compares agents watched for different lengths of time — observed days run
 * from about 4 to about 30 across the agents that would qualify.
 */
test('the metric names its window and its denominator', () => {
  assert.match(ANSWER_RATE_COLUMN, /answered/i);
  assert.match(ANSWER_RATE_COLUMN, new RegExp(String(RESPONSIVENESS_WINDOW_DAYS)));
  assert.equal(RESPONSIVENESS_WINDOW_LABEL, '30d');
});

/*
 * The one thing this view must never be read as. "Answer rate" slides into
 * "answer quality" without any help from the page, so the refusal is pinned
 * here rather than left to a reviewer to notice.
 */
test('the metric refuses to describe itself as quality, uptime or reliability', () => {
  assert.match(ANSWER_RATE_DOES_NOT_MEAN, /not answer quality/i);
  assert.match(ANSWER_RATE_DOES_NOT_MEAN, /not uptime/i);
  assert.match(ANSWER_RATE_DOES_NOT_MEAN, /not reliability/i);
  assert.match(ANSWER_RATE_MEANS, /replied|answered/i);
  for (const sentence of [ANSWER_RATE_COLUMN, ANSWER_RATE_MEANS]) {
    assert.doesNotMatch(sentence, /\bquality\b/i, 'the column and its meaning must not use the word');
  }
});

test('the window read is the one the column names', () => {
  const record = buildTrackRecord(manyProbes(10, 7), NOW);
  const chosen = windowOf(record.windows);
  assert.equal(chosen?.label, RESPONSIVENESS_WINDOW_LABEL);
  assert.equal(chosen?.probes, 10);
  assert.equal(chosen?.answered, 7);
});

/*
 * Probes outside the window are not in the denominator. A rate whose window
 * is named on the column and whose figures came from a different period
 * would be the exact dishonesty the window exists to prevent.
 */
test('checks older than the window are outside the denominator', () => {
  const row = toResponsivenessRow(input([...manyProbes(60, 60, 5), ...manyProbes(40, 0, 45)]));
  assert.equal(row.checks, 60, 'the 45-day-old failures are not counted');
  assert.equal(row.answerRate, 1);
});

/*
 * A rate out of a handful of attempts is not a low rate, it is no
 * measurement. Showing it as 0% would publish a ranking of agents Pokter has
 * barely called.
 */
test('too few checks leaves a row unranked rather than ranked low', () => {
  const row = toResponsivenessRow(input(manyProbes(3, 0)));
  assert.equal(row.ranked, false);
  assert.equal(row.checks, 3);
  assert.equal(row.answered, 0);
  assert.equal(row.answerRate, 0, 'the figure is still computed, it is simply not ranked');
});

test('no check at all leaves the rate null, never zero', () => {
  const row = toResponsivenessRow(input([]));
  assert.equal(row.checks, 0);
  assert.equal(row.answerRate, null);
  assert.equal(row.ranked, false);
});

test('the minimum sample is applied at the stated threshold', () => {
  assert.equal(toResponsivenessRow(input(manyProbes(MIN_RESPONSIVENESS_CHECKS - 1, 10))).ranked, false);
  assert.equal(toResponsivenessRow(input(manyProbes(MIN_RESPONSIVENESS_CHECKS, 10))).ranked, true);
});

/*
 * A tie on the rate breaks on the number of checks behind it — the same
 * metric's own denominator, not a second metric blended in. Four of the
 * qualifying testnet agents sit at a perfect rate, so the tie is real.
 */
test('a tie on the rate breaks on sample size, not another metric', () => {
  const rows = [
    { agent: agent({ key: 'small', name: 'Aaa' }), checks: 60, answered: 60, answerRate: 1, ranked: true, protocol: 'a2a' },
    { agent: agent({ key: 'large', name: 'Zzz' }), checks: 240, answered: 240, answerRate: 1, ranked: true, protocol: 'a2a' },
  ] as ResponsivenessRow[];
  assert.deepEqual(sortResponsivenessRows(rows).map((r) => r.agent.key), ['large', 'small']);
});

test('a null rate never outranks a measured one', () => {
  const rows = [
    { agent: agent({ key: 'none' }), checks: 0, answered: 0, answerRate: null, ranked: false, protocol: null },
    { agent: agent({ key: 'poor' }), checks: 80, answered: 8, answerRate: 0.1, ranked: true, protocol: 'a2a' },
  ] as ResponsivenessRow[];
  assert.deepEqual(sortResponsivenessRows(rows).map((r) => r.agent.key), ['poor', 'none']);
});

/*
 * Compared only within a category. A cross-category table would invite a
 * reader to treat one category's typical rate as the standard for another.
 */
test('agents are ranked inside their own category only', () => {
  const built = buildResponsivenessBoard({
    registryChainId: 97,
    byCategory: [
      {
        category: 'yield',
        inputs: [
          input(manyProbes(80, 80), { agent: agent({ key: 'y1', name: 'Yield One' }) }),
          input(manyProbes(80, 40), { agent: agent({ key: 'y2', name: 'Yield Two' }) }),
        ],
      },
      {
        category: 'grid-trading',
        inputs: [input(manyProbes(80, 60), { agent: agent({ key: 'g1', name: 'Grid One', category: 'grid-trading' }) })],
      },
    ],
    unreadCategories: [],
  });
  assert.deepEqual(built.categories.map((c) => c.category), ['yield', 'grid-trading']);
  assert.deepEqual(built.categories[0].ranked.map((r) => r.agent.key), ['y1', 'y2']);
  assert.deepEqual(built.categories[1].ranked.map((r) => r.agent.key), ['g1']);
  assert.equal(built.coverage.agentsRanked, 3);
});

test('unranked rows are ordered by how close they are to measurable, not by rate', () => {
  const built = buildResponsivenessBoard({
    registryChainId: 97,
    byCategory: [
      {
        category: 'yield',
        inputs: [
          input(manyProbes(2, 2), { agent: agent({ key: 'perfect-tiny', name: 'Aaa' }) }),
          input(manyProbes(20, 1), { agent: agent({ key: 'poor-bigger', name: 'Zzz' }) }),
        ],
      },
    ],
    unreadCategories: [],
  });
  assert.deepEqual(built.categories[0].ranked, []);
  assert.deepEqual(
    built.categories[0].belowMinimum.map((r) => r.agent.key),
    ['poor-bigger', 'perfect-tiny'],
    'a perfect two-of-two must not head a list of unranked agents',
  );
});

test('coverage reports the window, the threshold and what was actually measured', () => {
  const built = buildResponsivenessBoard({
    registryChainId: 56,
    byCategory: [
      {
        category: 'yield',
        inputs: [
          input(manyProbes(80, 70), { agent: agent({ key: 'a' }) }),
          input(manyProbes(4, 4), { agent: agent({ key: 'b' }) }),
          input([], { agent: agent({ key: 'c' }) }),
        ],
      },
    ],
    unreadCategories: ['token-safety'],
  });
  assert.equal(built.coverage.registryChainId, 56);
  assert.equal(built.coverage.windowDays, RESPONSIVENESS_WINDOW_DAYS);
  assert.equal(built.coverage.minimumChecks, MIN_RESPONSIVENESS_CHECKS);
  assert.equal(built.coverage.listedAgents, 3);
  assert.equal(built.coverage.agentsWithChecks, 2);
  assert.equal(built.coverage.agentsRanked, 1);
  assert.equal(built.coverage.checksInWindow, 84);
  assert.deepEqual(built.coverage.unreadCategories, ['token-safety']);
});

/*
 * A category whose registry reads all failed is reported as unread. Rendering
 * it empty would say no agent in it answers, which the failed read does not
 * establish.
 */
test('a category that could not be read is named rather than shown empty', () => {
  const built = buildResponsivenessBoard({
    registryChainId: 97,
    byCategory: [{ category: 'yield', inputs: [] }],
    unreadCategories: ['rebalancing', 'health-factor'],
  });
  assert.deepEqual(built.coverage.unreadCategories, ['rebalancing', 'health-factor']);
  assert.equal(built.coverage.listedAgents, 0);
});

test('the last check recorded is the newest across every category', () => {
  const built = buildResponsivenessBoard({
    registryChainId: 97,
    byCategory: [
      { category: 'yield', inputs: [input(manyProbes(60, 60, 9))] },
      { category: 'grid-trading', inputs: [input(manyProbes(60, 60, 1))] },
    ],
    unreadCategories: [],
  });
  assert.equal(built.coverage.lastCheckedAt, new Date(NOW.getTime() - 86_400_000).toISOString());
});
