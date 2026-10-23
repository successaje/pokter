import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { buildTrackRecord } from '../src/lib/history/record';
import { formatDuration, formatPercent } from '../src/lib/ui/format';

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
  formatObservedSpan,
  spanDecimal,
  MIN_RESPONSIVENESS_CHECKS,
  observedSpanNote,
  RESPONSIVENESS_WINDOW_DAYS,
  RESPONSIVENESS_WINDOW_LABEL,
  sortResponsivenessRows,
  toResponsivenessRow,
  windowOf,
  type ResponsivenessCoverage,
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
    firstSeen: record.firstSeen,
    observedDays: record.observedDays,
    ...overrides,
  };
}

function manyProbes(total: number, answered: number, daysAgo = 5): Probe[] {
  return Array.from({ length: total }, (_, i) => probe(daysAgo, i < answered));
}

/**
 * `total` answered probes spread evenly over `spanDays`, the newest
 * `endDaysAgo` ago. `manyProbes` stacks every probe on one instant, which is a
 * span of nought and cannot exercise a figure about how long an agent has been
 * watched.
 */
function spanningProbes(total: number, spanDays: number, endDaysAgo = 1): Probe[] {
  return Array.from({ length: total }, (_, i) =>
    probe(endDaysAgo + spanDays * (1 - i / Math.max(1, total - 1)), true),
  );
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


/*
 * The rate a reader sees must not round a failure away.
 *
 * `mandaterebalance-agent` sat at the top of the production mainnet board
 * with 349 of 350 checks answered, and the column printed "100%". One check
 * had failed and the headline figure said none had. The denominator on the
 * same row kept it checkable, but "100%" is what survives a screenshot, and
 * a figure that becomes a claim once separated from its context is the same
 * defect as a nought on a share card.
 *
 * One decimal place is enough to tell the two apart, and a genuine clean
 * record still reads 100%.
 */
test('349 of 350 is not rendered as 100%', () => {
  const rendered = formatPercent(349 / 350, { decimals: 1 });
  assert.notEqual(rendered, '100%', 'a failed check must not round away');
  assert.equal(rendered, '99.7%');
});

test('a clean record still reads 100%', () => {
  assert.equal(formatPercent(350 / 350, { decimals: 1 }), '100.0%');
});

test('the board renders the rate with a decimal place', () => {
  const page = readFileSync(new URL('../src/app/(site)/leaderboard/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /formatPercent\(row\.answerRate, \{ decimals: 1 \}\)/);
  assert.doesNotMatch(page, /formatPercent\(row\.answerRate, \{ decimals: 0 \}\)/);
});

/*
 * Rounding is display only. Two rows that differ in the real rate must still
 * be ordered by it, whatever they print.
 */
test('ordering reads the unrounded rate, not the rendered one', () => {
  const rows = [
    { agent: agent({ key: 'lower', name: 'Aaa' }), checks: 350, answered: 349, answerRate: 349 / 350, ranked: true, protocol: 'a2a' },
    { agent: agent({ key: 'perfect', name: 'Zzz' }), checks: 350, answered: 350, answerRate: 1, ranked: true, protocol: 'a2a' },
  ] as ResponsivenessRow[];
  assert.deepEqual(sortResponsivenessRows(rows).map((r) => r.agent.key), ['perfect', 'lower']);
});

/*
 * ---------------------------------------------------------------------------
 * How much measurement is behind each rate.
 *
 * The board ranks on `answered ÷ checks` over a window the column names as 30
 * days, and the rows do not hold the same amount of it. Measured on 23 October
 * 2026 from `/api/v1/agents`, the span between an agent's first and last loaded
 * check ran 4.1688 to 29.9290 days across the 60 of 76 mainnet listings with
 * any check, and 0.1154 to 20.7035 days across 47 of 95 on testnet — so a row
 * covering a tenth of a day can sit in the same order as one covering nearly
 * the whole window.
 *
 * The span is disclosed, not used as a gate. Restricting the order to agents
 * whose history covers the full window would empty the board: the catalogue
 * loads probes with `HISTORY_DAYS = 30`, the same period the window names, so
 * a loaded span cannot reach 30 days whatever an agent's real age is.
 * ---------------------------------------------------------------------------
 */

function coverage(overrides: Partial<ResponsivenessCoverage> = {}): ResponsivenessCoverage {
  return {
    registryChainId: 56,
    windowDays: RESPONSIVENESS_WINDOW_DAYS,
    minimumChecks: MIN_RESPONSIVENESS_CHECKS,
    listedAgents: 76,
    agentsWithChecks: 60,
    agentsRanked: 60,
    checksInWindow: 12_000,
    lastCheckedAt: NOW.toISOString(),
    unreadCategories: [],
    rankedSpanDays: { shortest: 4.168781550925926, longest: 29.928998032407407 },
    ...overrides,
  };
}

/*
 * The span a row prints must not round up to the window it is being compared
 * against. `formatDuration` rounds to whole days, so it renders the 29.9290-day
 * mainnet spans as "30d" — a row whose only job is to show it has not covered
 * 30 days would claim it had. Same defect as the nought that turned 349 of 350
 * checks into "100%".
 */
test('a span just short of the window is not rendered as the whole window', () => {
  assert.equal(formatDuration(29.928998032407407), '30d', 'the helper this deliberately avoids');
  const rendered = formatObservedSpan(29.928998032407407);
  assert.match(rendered, /29\.9 of 30 days/);
  assert.doesNotMatch(rendered, /30\.0 of 30/, 'the span must not round up to the full window');
});

/* A tenth of a day is a real measured span on testnet and must survive being
   printed, rather than collapsing to the nought that reads as "no history". */
test('a span under a day keeps its figure', () => {
  assert.match(formatObservedSpan(0.1154375), /0\.1 of 30 days/);
  /* Floored, not rounded: the span never reports more coverage than measured. */
  assert.match(formatObservedSpan(2.3757), /2\.3 of 30 days/);
});

test('the span names the window it is a share of', () => {
  assert.match(formatObservedSpan(12.5), new RegExp(`of ${RESPONSIVENESS_WINDOW_DAYS} days`));
});

/* The same refusal the rate itself carries: this is a span of checks, not a
   statement about how good the answers were. */
test('neither the span nor the note describes the agent as good', () => {
  for (const copy of [formatObservedSpan(29.93), observedSpanNote(coverage())]) {
    for (const word of [/\bquality\b/i, /\baccurac/i, /\buptime\b/i, /\breliab/i]) {
      assert.doesNotMatch(copy, word, `must not stand in for answer quality: ${copy}`);
    }
  }
});

/*
 * The row reports the span the record already measured. Deriving it a second
 * time here could disagree with the figures printed beside it, which come from
 * the same probe list.
 */
test('the row carries the record’s own span, not a recomputed one', () => {
  const probes = [...manyProbes(60, 60, 9), ...manyProbes(60, 60, 2)];
  const record = buildTrackRecord(probes, NOW);
  const row = toResponsivenessRow(input(probes));
  assert.equal(row.observedDays, record.observedDays);
  assert.equal(row.observedDays, 7, 'nine days ago to two days ago');
  assert.equal(row.firstSeen, record.firstSeen);
  assert.notEqual(row.observedDays, RESPONSIVENESS_WINDOW_DAYS, 'not the window’s own length');
});

/*
 * The decision this view turns on. An agent with enough checks over half a day
 * is ranked and labelled, never withheld: a board restricted to full-window
 * histories would be empty today, and a blank page is a worse answer than a
 * disclosed limit.
 */
test('a short span is ranked and disclosed, never withheld', () => {
  const built = buildResponsivenessBoard({
    registryChainId: 97,
    byCategory: [
      {
        category: 'yield',
        inputs: [input(spanningProbes(80, 0.5), { agent: agent({ key: 'brand-new' }) })],
      },
    ],
    unreadCategories: [],
  });
  const [row] = built.categories[0].ranked;
  assert.ok(row, 'half a day of checks must still produce a ranked row');
  assert.equal(row.agent.key, 'brand-new');
  assert.equal(row.observedDays, 0.5);
  assert.deepEqual(built.categories[0].belowMinimum, [], 'enough checks is the only gate');
});

/*
 * The spread quoted beside the column describes the order the board publishes,
 * so an unranked row must not widen it. The unranked agent below has the
 * longest span on the board and the fewest checks; counting it would advertise
 * a limit on a comparison it never entered.
 */
test('the reported spread covers the ranked rows only', () => {
  const built = buildResponsivenessBoard({
    registryChainId: 56,
    byCategory: [
      {
        category: 'yield',
        inputs: [
          input(spanningProbes(80, 7), { agent: agent({ key: 'long', name: 'Long' }) }),
          input(spanningProbes(80, 3), { agent: agent({ key: 'short', name: 'Short' }) }),
          input(spanningProbes(4, 20), { agent: agent({ key: 'unranked', name: 'Unranked' }) }),
        ],
      },
    ],
    unreadCategories: [],
  });
  assert.equal(built.categories[0].belowMinimum.length, 1, 'the 20-day row has too few checks');
  assert.deepEqual(built.coverage.rankedSpanDays, { shortest: 3, longest: 7 });
});

test('the spread spans every category, because the read bound is one read', () => {
  const built = buildResponsivenessBoard({
    registryChainId: 56,
    byCategory: [
      { category: 'yield', inputs: [input(spanningProbes(80, 11))] },
      { category: 'grid-trading', inputs: [input(spanningProbes(80, 2))] },
    ],
    unreadCategories: [],
  });
  assert.deepEqual(built.coverage.rankedSpanDays, { shortest: 2, longest: 11 });
});

test('no ranked row leaves the spread absent rather than nought', () => {
  const built = buildResponsivenessBoard({
    registryChainId: 97,
    byCategory: [{ category: 'yield', inputs: [input(manyProbes(3, 3))] }],
    unreadCategories: [],
  });
  assert.equal(built.coverage.rankedSpanDays, null);
  assert.match(observedSpanNote(built.coverage), /no spread to report/i);
});

/*
 * The mutation test for the note. The claim this replaces was a fixed
 * sentence — that no agent had 30 days of history, so the window truncated
 * nobody — and a fixed sentence keeps asserting itself after the data moves.
 * A note that quotes the board it is rendered beside has to change when the
 * board does; a hardcoded one passes the first two assertions here and fails
 * these.
 */
test('the note quotes the live spread, so it cannot be a fixed sentence', () => {
  const mainnet = observedSpanNote(coverage());
  const testnet = observedSpanNote(
    coverage({ registryChainId: 97, rankedSpanDays: { shortest: 11.0203, longest: 20.70350789 } }),
  );
  assert.match(mainnet, /4\.1/);
  assert.match(mainnet, /29\.9/);
  assert.match(testnet, /11\.0/);
  assert.match(testnet, /20\.7/);
  assert.notEqual(mainnet, testnet, 'the note must track the data it describes');
  assert.doesNotMatch(testnet, /4\.1|29\.9/, 'mainnet’s figures must not survive into testnet’s note');
});

test('the note names the window the spans are a share of', () => {
  assert.match(observedSpanNote(coverage()), new RegExp(`last ${RESPONSIVENESS_WINDOW_DAYS} days`));
});

/*
 * A board where every ranked row happens to share a span must not read "from
 * 20.7 to 20.7", which looks like a bug rather than a fact.
 */
test('one shared span is stated as one figure, not as a range', () => {
  const note = observedSpanNote(coverage({ rankedSpanDays: { shortest: 20.7035, longest: 20.7035 } }));
  assert.match(note, /Every ranked row covers 20\.7 of the 30 days/);
  assert.doesNotMatch(note, /from 20\.7 to 20\.7/);
});

/*
 * The disclosure's whole argument is that the catalogue read and the ranked
 * window are the same 30 days, which is why the window truncates nothing out
 * of what was loaded and why a loaded span cannot reach 30. Widen the read and
 * that reasoning stops holding, so the bound is asserted as a value rather
 * than grepped for.
 */
test('the catalogue read bound is the same period the column names', () => {
  const marketplace = readFileSync(new URL('../src/lib/marketplace.ts', import.meta.url), 'utf8');
  const found = /const HISTORY_DAYS = (\d+);/.exec(marketplace);
  assert.ok(found, 'HISTORY_DAYS must still be a literal in lib/marketplace.ts');
  assert.equal(
    Number(found[1]),
    RESPONSIVENESS_WINDOW_DAYS,
    'the span disclosure reasons from the read and the window being one period',
  );
});

/* The loader hands the record's figures over rather than deriving its own. */
test('the loader passes the record’s span through', () => {
  const server = readFileSync(new URL('../src/lib/leaderboard/server.ts', import.meta.url), 'utf8');
  assert.match(server, /observedDays: entry\.record\.observedDays/);
  assert.match(server, /firstSeen: entry\.record\.firstSeen/);
});

/*
 * Wiring, as source facts: a `server-only` route cannot be imported here, so
 * the page is read. The negatives are the point — a rounded span on the row
 * would undo `formatObservedSpan`, and a note written inline would undo the
 * reason it is built from coverage.
 */
test('the board renders each row’s span and the live note', () => {
  const page = readFileSync(new URL('../src/app/(site)/leaderboard/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /formatObservedSpan\(row\.observedDays\)/);
  assert.match(page, /observedSpanNote\(responsiveness\.data\.coverage\)/);
  assert.doesNotMatch(page, /formatDuration\(row\.observedDays\)/);
  assert.doesNotMatch(page, /Math\.round\(row\.observedDays\)/);
});

/*
 * A span may never print as the whole window.
 *
 * The window is the read bound itself — `HISTORY_DAYS` caps what the
 * catalogue loads — so no row can cover all of it, and a row saying it does
 * contradicts the note directly above it, which warns that spans only
 * approach the edge. `toFixed(1)` rounds, so every span at or above 29.95
 * printed "30.0", and eight rows on the live mainnet board read "over 30.0
 * of 30 days" while the true maximum was 29.9705.
 *
 * The existing coverage did not catch it because it exercised 29.9290 — the
 * one production span that happens to round down. So this names the value
 * that was actually shipping, and asserts the boundary from both sides.
 */
test('a span near the window floor never claims the whole window', () => {
  assert.equal(spanDecimal(29.9705), '29.9', 'the live maximum printed as 30.0 before this');
  assert.equal(spanDecimal(29.95), '29.9', 'the rounding boundary itself');
  assert.equal(spanDecimal(29.99999), '29.9');
  assert.equal(formatObservedSpan(29.9705), 'over 29.9 of 30 days');

  assert.doesNotMatch(
    formatObservedSpan(29.9705),
    /30\.0 of 30/,
    'a row claimed it covered the entire window, which the read bound makes impossible',
  );

  /* Flooring must not distort an ordinary span, only refuse to round one up. */
  assert.equal(spanDecimal(4.1688), '4.1');
  assert.equal(spanDecimal(8.2666), '8.2');
  assert.equal(spanDecimal(0), '0.0');
});

test('the spread note never claims a ranked row covered the whole window', () => {
  const note = observedSpanNote({
    ...coverage(),
    rankedSpanDays: { shortest: 4.1688, longest: 29.9705 },
  });
  assert.match(note, /4\.1 to 29\.9 of the 30 days/);
  assert.doesNotMatch(note, /30\.0 of the 30 days/, 'the warning itself claimed full coverage');
});
