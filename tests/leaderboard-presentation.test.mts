import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import type { HiredJob } from '../src/lib/erc8183/types';
import {
  ALL_CATEGORIES,
  browseQueryFrom,
  browseSummary,
  categoryCounts,
  isNarrowed,
  matchesCategory,
  matchesSearch,
  MAX_SEARCH,
  pageLinks,
  pageOf,
  ROWS_PER_PAGE,
  type BrowseQuery,
} from '../src/lib/leaderboard/browse';
import {
  hasWatch,
  rowDisclosures,
  rowReceipts,
  summaryOf,
} from '../src/lib/leaderboard/disclosures';
import { leaderboardHref } from '../src/lib/leaderboard/href';
import type { BoardAgent } from '../src/lib/leaderboard/network';
import {
  outcomeMetricValue,
  rankOutcomeRows,
  sortOutcomeRows,
  type OutcomeRow,
} from '../src/lib/leaderboard/outcomes';
import { OUTCOMES_PERIOD, periodOf, RESPONSIVENESS_PERIOD } from '../src/lib/leaderboard/period';
import { LEADERBOARD_METHOD, LEADERBOARD_METHOD_HREF } from '../src/lib/leaderboard/method';
import { RESPONSIVENESS_WINDOW_DAYS } from '../src/lib/leaderboard/responsiveness';

const page = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const BOARD = 'src/app/(site)/leaderboard/page.tsx';
/* Comments quote the defects they prevent, so assertions about published
   copy read the file with them stripped. Same rule, and same reason, as
   `tests/leaderboard-consistency.test.mts`. */
const copy = (path: string) =>
  page(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

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

function row(overrides: Partial<OutcomeRow> = {}): OutcomeRow {
  return {
    agent: agent(),
    listed: true,
    settledJobs: 0,
    externalBuyers: 0,
    repeatBuyers: 0,
    deliveredUnsettled: 0,
    courierSettled: 0,
    relayedSettled: 0,
    operatorBuyers: 0,
    reviewerBuyers: 0,
    settled: [],
    delivered: [],
    courier: [],
    relayed: [],
    lastSettledAt: null,
    ...overrides,
  };
}

let nextJob = 1500;
function job(): HiredJob {
  nextJob += 1;
  return {
    id: `97:${nextJob}`,
    jobId: String(nextJob),
    chainId: 97,
    isTestnet: true,
    agentChainId: 97,
    agentTokenId: '2618',
    agentName: 'Nagi',
    provider: '0xaaaa' as HiredJob['provider'],
    client: '0xbbbb' as HiredJob['client'],
    task: 'Assess the position.',
    budgetRaw: '1',
    expiredAt: '2026-10-22T00:00:00.000Z',
    hiredAt: '2026-10-20T00:00:00.000Z',
    hireTxHash: null,
    status: 'COMPLETED',
    statusCheckedAt: '2026-10-23T12:26:00.000Z',
    deliverableUrl: null,
    settleTxHash: null,
  };
}

const NO_BROWSE: BrowseQuery = { search: '', category: ALL_CATEGORIES, page: 1 };

/* ------------------------------------------------------------------ *
 * The rank is produced by the column that explains the order.
 *
 * Ordered by "Repeat external buyer wallets", the production board printed
 * `03 Halong Yield`, `05 Position Guard by Dyplux`, `06 Runway Treasurer`,
 * `08 TiltBalance` and `09 Venus Yield Keeper` — every one of them with
 * nought repeat buyers, under the header that says it produced the order.
 * The numbering had holes in it too, because the dash was decided by
 * `settledJobs` while the sort was decided by the chosen metric.
 *
 * Both faults are one rule, so the rule is what is exercised: a rank exists
 * exactly where the ordering metric does.
 * ------------------------------------------------------------------ */

test('no rank is printed where the ordering metric is nought', () => {
  const rows = sortOutcomeRows(
    [
      row({ agent: agent({ key: 'a', name: 'Alpha' }), settledJobs: 9, externalBuyers: 5, repeatBuyers: 2 }),
      row({ agent: agent({ key: 'b', name: 'Bravo' }), settledJobs: 2, externalBuyers: 2, repeatBuyers: 0 }),
      row({ agent: agent({ key: 'c', name: 'Charlie' }), settledJobs: 3, externalBuyers: 3, repeatBuyers: 0 }),
    ],
    'repeat-buyers',
  );
  const ranked = rankOutcomeRows(rows, 'repeat-buyers');
  assert.deepEqual(
    ranked.map(({ row: r, rank }) => [r.agent.name, rank]),
    [
      ['Alpha', 1],
      ['Bravo', null],
      ['Charlie', null],
    ],
    'a row with no repeat buyer cannot place in an order made of repeat buyers',
  );
});

test('the numbers that are printed run without a gap', () => {
  const rows = sortOutcomeRows(
    [
      row({ agent: agent({ key: 'a', name: 'Alpha' }), settledJobs: 4, repeatBuyers: 3 }),
      /* Settled nothing, so the old rule dashed it — in the middle of the order. */
      row({ agent: agent({ key: 'b', name: 'Bravo' }), settledJobs: 0, repeatBuyers: 2 }),
      row({ agent: agent({ key: 'c', name: 'Charlie' }), settledJobs: 7, repeatBuyers: 1 }),
    ],
    'repeat-buyers',
  );
  const printed = rankOutcomeRows(rows, 'repeat-buyers')
    .map(({ rank }) => rank)
    .filter((rank): rank is number => rank !== null);
  assert.deepEqual(printed, [1, 2, 3], 'a reader who sees 03 then 05 concludes a row was hidden');
});

/*
 * The counter must not advance on a row it refuses to number.
 *
 * Given the board's own ordering an unranked row is always last, so a
 * counter that advanced on it would be invisible — until the day the rows
 * arrive in some other order, which is exactly how 03, —, 05 reached
 * production. The property is pinned on an unsorted list so it holds
 * whatever the caller did first.
 */
test('an unranked row in the middle does not consume a number', () => {
  const unsorted = [
    row({ agent: agent({ key: 'a', name: 'Alpha' }), settledJobs: 4, repeatBuyers: 3 }),
    row({ agent: agent({ key: 'b', name: 'Bravo' }), settledJobs: 2, repeatBuyers: 0 }),
    row({ agent: agent({ key: 'c', name: 'Charlie' }), settledJobs: 7, repeatBuyers: 1 }),
  ];
  assert.deepEqual(
    rankOutcomeRows(unsorted, 'repeat-buyers').map(({ rank }) => rank),
    [1, null, 2],
  );
});

test('ordered by settled jobs, the ranks are what the board already published', () => {
  const rows = sortOutcomeRows(
    [
      row({ agent: agent({ key: 'a', name: 'Alpha' }), settledJobs: 9 }),
      row({ agent: agent({ key: 'b', name: 'Bravo' }), settledJobs: 1 }),
      row({ agent: agent({ key: 'k', name: 'Keel' }), settledJobs: 0, relayedSettled: 1 }),
    ],
    'settled-jobs',
  );
  assert.deepEqual(
    rankOutcomeRows(rows, 'settled-jobs').map(({ row: r, rank }) => [r.agent.name, rank]),
    [
      ['Alpha', 1],
      ['Bravo', 2],
      ['Keel', null],
    ],
  );
});

test('each metric reads its own figure and no other', () => {
  const r = row({ settledJobs: 9, externalBuyers: 5, repeatBuyers: 2 });
  assert.equal(outcomeMetricValue(r, 'settled-jobs'), 9);
  assert.equal(outcomeMetricValue(r, 'external-buyers'), 5);
  assert.equal(outcomeMetricValue(r, 'repeat-buyers'), 2);
});

test('the page takes its rank from the rule rather than from the row’s position', () => {
  const source = copy(BOARD);
  assert.match(source, /rankOutcomeRows\(outcomes\.data\.rows, metric\)/);
  assert.doesNotMatch(
    source,
    /row\.settledJobs > 0 \?/,
    'the dash read the settled count while the order read the chosen metric',
  );
});

/* ------------------------------------------------------------------ *
 * Narrowing a board without changing what it claims.
 * ------------------------------------------------------------------ */

test('a category nobody offers falls back to the whole board', () => {
  assert.equal(browseQueryFrom({ category: 'nonsense' }).category, ALL_CATEGORIES);
  assert.equal(browseQueryFrom({ category: ['yield'] }).category, 'yield');
  assert.equal(browseQueryFrom({ category: 'unclassified' }).category, 'unclassified');
  assert.equal(browseQueryFrom({}).category, ALL_CATEGORIES);
});

test('a page number that is not one is not invented', () => {
  assert.equal(browseQueryFrom({ page: '3' }).page, 3);
  assert.equal(browseQueryFrom({ page: '0' }).page, 1);
  assert.equal(browseQueryFrom({ page: '-4' }).page, 1);
  assert.equal(browseQueryFrom({ page: 'two' }).page, 1);
  assert.equal(browseQueryFrom({ page: '2.9' }).page, 2);
});

test('the search is trimmed and bounded', () => {
  assert.equal(browseQueryFrom({ q: '  venus  ' }).search, 'venus');
  assert.equal(browseQueryFrom({ q: 'x'.repeat(500) }).search.length, MAX_SEARCH);
  assert.equal(isNarrowed(browseQueryFrom({})), false);
  assert.equal(isNarrowed(browseQueryFrom({ q: 'venus' })), true);
  assert.equal(isNarrowed(browseQueryFrom({ category: 'yield' })), true);
});

test('matching is on the name, case-insensitively, and on nothing else', () => {
  const nagi = agent({ name: 'Nagi', tokenId: '2618', chainId: 97 });
  assert.equal(matchesSearch(nagi, 'nag'), true);
  assert.equal(matchesSearch(nagi, 'NAGI'), true);
  assert.equal(matchesSearch(nagi, ''), true);
  assert.equal(matchesSearch(nagi, 'venus'), false);
  /* The chain and the token id are not searchable: "97" would otherwise
     select every testnet registration, which is a filter with no visible
     rule behind it. */
  assert.equal(matchesSearch(nagi, '97'), false);
  assert.equal(matchesSearch(nagi, '2618'), false);
});

test('the category filter keeps only its own category', () => {
  assert.equal(matchesCategory(agent({ category: 'yield' }), 'yield'), true);
  assert.equal(matchesCategory(agent({ category: 'yield' }), 'grid-trading'), false);
  assert.equal(matchesCategory(agent({ category: 'yield' }), ALL_CATEGORIES), true);
  assert.equal(matchesCategory(agent({ category: 'unclassified' }), 'unclassified'), true);
});

test('counts come from the board, so a chip cannot promise rows that are not there', () => {
  const counts = categoryCounts([
    agent({ key: '1', category: 'yield' }),
    agent({ key: '2', category: 'yield' }),
    agent({ key: '3', category: 'unclassified' }),
  ]);
  assert.equal(counts.get('yield'), 2);
  assert.equal(counts.get('unclassified'), 1);
  assert.equal(counts.get('grid-trading'), undefined);
});

test('a page beyond the last one shows the last one, never an empty table', () => {
  const rows = Array.from({ length: 12 }, (_, i) => i);
  const result = pageOf(rows, () => true, { ...NO_BROWSE, page: 9 }, 10);
  assert.equal(result.page, 2);
  assert.deepEqual([...result.rows], [10, 11]);
  assert.equal(result.from, 11);
  assert.equal(result.to, 12);
  assert.equal(result.pages, 2);
  assert.equal(result.matched, 12);
  assert.equal(result.total, 12);
});

test('a filtered page still reports the whole board behind it', () => {
  const rows = ['venus one', 'venus two', 'nagi'];
  const result = pageOf(rows, (name) => name.includes('venus'), { ...NO_BROWSE, search: 'venus' }, 10);
  assert.equal(result.matched, 2);
  assert.equal(result.total, 3, 'a reader must be able to tell the board from the slice of it');
});

test('nothing matched leaves no row positions to report', () => {
  const result = pageOf(['nagi'], () => false, { ...NO_BROWSE, search: 'venus' }, 10);
  assert.equal(result.matched, 0);
  assert.equal(result.from, null);
  assert.equal(result.to, null);
  assert.equal(result.pages, 1, 'one empty page, not nought pages');
});

test('a board that shows all of itself gets no caption', () => {
  const result = pageOf([1, 2, 3], () => true, NO_BROWSE, 10);
  assert.equal(
    browseSummary(result, NO_BROWSE),
    null,
    'a caption that always appears is one readers learn to ignore',
  );
});

test('the caption quotes the term and names the category it is narrowed to', () => {
  const query: BrowseQuery = { search: 'venus', category: 'yield', page: 1 };
  const result = pageOf(
    ['Venus Yield Keeper', 'Venus Rate Router', 'Nagi'],
    (name) => name.startsWith('Venus'),
    query,
    10,
  );
  const caption = browseSummary(result, query);
  assert.ok(caption);
  assert.equal(caption, 'Showing 1–2 of 2 agents matching “venus”, in Yield Optimisation, from 3 on this board.');
});

test('a search with no match says so without claiming the board is empty', () => {
  const query: BrowseQuery = { search: 'zzz', category: ALL_CATEGORIES, page: 1 };
  const result = pageOf(['Nagi'], () => false, query, 10);
  const caption = browseSummary(result, query);
  assert.ok(caption);
  assert.equal(caption, 'No agents on this board matching “zzz”.');
  assert.doesNotMatch(
    caption,
    /no qualifying external settlements/i,
    'the sentence for an empty board is a different claim and must not be borrowed',
  );
});

test('a second page of an unfiltered board says which rows it holds', () => {
  const query: BrowseQuery = { ...NO_BROWSE, page: 2 };
  const result = pageOf(Array.from({ length: 14 }, (_, i) => i), () => true, query, 10);
  const caption = browseSummary(result, query);
  assert.ok(caption);
  assert.match(caption, /Showing 11–14 of 14 agents/);
});

test('page links elide rather than printing every number', () => {
  assert.deepEqual([...pageLinks(1, 3)], [1, 2, 3]);
  assert.deepEqual([...pageLinks(1, 7)], [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual([...pageLinks(1, 20)], [1, 2, null, 20]);
  assert.deepEqual([...pageLinks(10, 20)], [1, null, 9, 10, 11, null, 20]);
  assert.deepEqual([...pageLinks(20, 20)], [1, null, 19, 20]);
  assert.ok(pageLinks(10, 20).every((n) => n === null || (n >= 1 && n <= 20)));
});

test('a row’s page size is the one the page paginates by', () => {
  assert.equal(ROWS_PER_PAGE, 10);
  assert.match(copy(BOARD), /pageOf\(ranked, \(\{ row \}\) => matchesBrowse\(row\.agent, browse\), browse\)/);
});

test('every link on the board carries what the reader narrowed it to', () => {
  assert.equal(
    leaderboardHref({ network: 'testnet', view: 'outcomes', metric: 'repeat-buyers' }, { search: 'venus', category: 'yield', page: 3 }),
    '/leaderboard?network=testnet&metric=repeat-buyers&q=venus&category=yield&page=3',
  );
  /* Defaults stay out, so the canonical board is still a bare path. */
  assert.equal(leaderboardHref({}, { search: '', category: 'all', page: 1 }), '/leaderboard');
  assert.equal(leaderboardHref({}, { search: '   ' }), '/leaderboard');
});

/* ------------------------------------------------------------------ *
 * Disclosures survive being folded into a toggle.
 * ------------------------------------------------------------------ */

test('every disclosure the row used to print inline is still produced', () => {
  const r = row({
    listed: false,
    settledJobs: 2,
    externalBuyers: 4,
    operatorBuyers: 3,
    reviewerBuyers: 2,
    courierSettled: 1,
    relayedSettled: 1,
    settled: [job(), job()],
    courier: [job()],
    relayed: [job()],
  });
  const ids = rowDisclosures(r).map((disclosure) => disclosure.id);
  assert.deepEqual(ids, ['unlisted', 'relayed', 'courier', 'operator-buyers', 'reviewer-buyers']);
});

test('the courier and the relayed answer are never said as one thing', () => {
  const both = rowDisclosures(row({ courierSettled: 1, relayedSettled: 1, courier: [job()], relayed: [job()] }));
  const relayed = both.find((d) => d.id === 'relayed');
  const courier = both.find((d) => d.id === 'courier');
  assert.ok(relayed && courier);
  assert.match(relayed.detail, /carrying this agent’s own answer/);
  assert.match(courier.detail, /with no answer of this agent’s in it/);
  for (const disclosure of [relayed, courier]) {
    assert.match(disclosure.detail, /Not counted above\./);
  }
});

test('unread attestation authors are disclosed, and are not a nought', () => {
  const unread = rowDisclosures(row({ reviewerBuyers: null }));
  assert.equal(unread.length, 1);
  assert.match(unread[0].detail, /Attestation authors not read/);
  /* Nought overlap is a measurement and says nothing on the row. */
  assert.deepEqual(rowDisclosures(row({ reviewerBuyers: 0 })), []);
});

test('a row with nothing to disclose gets no toggle at all', () => {
  const clean = row({ settledJobs: 0 });
  assert.equal(summaryOf(rowDisclosures(clean), rowReceipts(clean)), null);
});

test('the closed toggle names what is inside it', () => {
  const r = row({
    settledJobs: 2,
    externalBuyers: 4,
    operatorBuyers: 3,
    reviewerBuyers: 2,
    settled: [job(), job()],
  });
  const summary = summaryOf(rowDisclosures(r), rowReceipts(r));
  assert.ok(summary);
  assert.match(summary, /3 buyers own a listed agent/, 'a reader who never opens it still learns this');
  assert.match(summary, /2 buyers also reviewed/);
  assert.match(summary, /2 receipts/);
  assert.doesNotMatch(summary, /^Details$/, 'a toggle labelled "details" hides the fact it carries');
});

test('the summary counts every receipt the body will show', () => {
  const r = row({
    settledJobs: 2,
    settled: [job(), job()],
    deliveredUnsettled: 1,
    delivered: [job()],
    courierSettled: 1,
    courier: [job()],
  });
  const summary = summaryOf(rowDisclosures(r), rowReceipts(r));
  assert.ok(summary);
  assert.match(summary, /4 receipts/, 'the closed count must agree with the open list');
});

test('a disclosure that weakens the figures is marked as one', () => {
  assert.equal(hasWatch(rowDisclosures(row({ operatorBuyers: 1, externalBuyers: 2 }))), true);
  assert.equal(hasWatch(rowDisclosures(row({ reviewerBuyers: 1 }))), true);
  assert.equal(hasWatch(rowDisclosures(row({ listed: false }))), true);
  assert.equal(hasWatch(rowDisclosures(row({ relayedSettled: 1, relayed: [job()] }))), false);
});

test('one buyer, one wallet: the sentences count in the singular', () => {
  const one = rowDisclosures(row({ operatorBuyers: 1, externalBuyers: 1, reviewerBuyers: 1 }));
  assert.match(one[0].detail, /1 of 1 buyer wallet here own/);
  assert.equal(one[0].summary, '1 buyer owns a listed agent');
  assert.match(one[0].detail, /1 of 1 buyer wallet here owns a listed agent/);
  const many = rowDisclosures(row({ operatorBuyers: 3, externalBuyers: 5 }));
  assert.match(many[0].detail, /3 of 5 buyer wallets here own a listed agent/);
  assert.equal(many[0].summary, '3 buyers own a listed agent');
});

test('settled and unsettled receipts are kept apart', () => {
  const r = row({ settledJobs: 1, settled: [job()], deliveredUnsettled: 1, delivered: [job()] });
  assert.deepEqual(
    rowReceipts(r).map((group) => group.label),
    ['Settled receipts', 'Delivered, unsettled receipts'],
  );
  assert.deepEqual(rowReceipts(row()), []);
});

test('the board renders the disclosures from the rule, not from its own copy', () => {
  const source = copy(BOARD);
  assert.match(source, /rowDisclosures\(row\)/);
  assert.match(source, /summaryOf\(rowDisclosures\(row\), rowReceipts\(row\)\)/);
  /* The sentences moved into `disclosures.ts`; a second copy on the page
     is how the two come to say different things. */
  assert.doesNotMatch(source, /buyer and reviewer are the same party/);
  assert.doesNotMatch(source, /with no answer of this agent/);
});

/* ------------------------------------------------------------------ *
 * The period is stated, and only offered as a choice where one exists.
 * ------------------------------------------------------------------ */

test('the outcomes board states a period it can actually keep', () => {
  assert.equal(periodOf('outcomes'), OUTCOMES_PERIOD);
  assert.match(OUTCOMES_PERIOD.value, /Every indexed job/);
  assert.doesNotMatch(
    OUTCOMES_PERIOD.value,
    /last \d+ days/i,
    'the outcomes board applies no rolling window, so it must not name one',
  );
  assert.match(OUTCOMES_PERIOD.note, /no rolling window/i);
});

test('the responsiveness board names the window its figures are taken from', () => {
  assert.equal(periodOf('responsiveness'), RESPONSIVENESS_PERIOD);
  assert.equal(RESPONSIVENESS_PERIOD.value, `Last ${RESPONSIVENESS_WINDOW_DAYS} days`);
  assert.match(RESPONSIVENESS_PERIOD.note, new RegExp(`${RESPONSIVENESS_WINDOW_DAYS} days`));
});


/*
 * The responsiveness probe span is a measurement of how long Pokter has been
 * calling the agent. On the outcomes board it would be read as how long the
 * agent has been delivering, which it does not measure.
 */
test('the probe span appears on responsiveness and nowhere near the outcomes evidence', () => {
  const source = copy(BOARD);
  const responsiveness = source.slice(source.indexOf('function ResponsivenessLine'));
  const outcomes = source.slice(
    source.indexOf('function EvidenceCell'),
    source.indexOf('function ResponsivenessHeader'),
  );
  assert.match(responsiveness, /formatObservedSpan\(row\.observedDays\)/);
  assert.doesNotMatch(outcomes, /observedDays|Observed \d|Observed \{/);
});






/*
 * The board leads with its rows, and the rules moved to the methodology
 * page it links to.
 *
 * These guards moved with the text rather than being deleted with it. A
 * disclosure that is no longer asserted anywhere is a disclosure on its
 * way out, and the whole reason the previous version of this test existed
 * was that the page had once quietly lost one.
 */
test('every rule the board used to print is published on the methodology page', () => {
  const method = JSON.stringify(LEADERBOARD_METHOD);
  for (const [name, pattern] of [
    ['no overall score', /There is no overall score/],
    ['the exclusions', /Excluded from every figure/],
    ['what a settled job does not prove', /does not prove the answer was correct/],
    ['what the answer rate is not', /not answer quality/],
    ['the ranking threshold', /at least \d+ checks inside the window to be ranked/],
    ['the span limit', /do not all hold the same part/],
    ['the handshake is not a task', /A handshake is not a task/],
    ['the refusals', /not a claim about what has happened on BNB Chain/],
    ['team set is not independence', /not the same as independent/],
    ['builders are not ranked', /Builders are deliberately not ranked/],
    ['never a nought for an answer it does not have', /never prints a nought in place of an answer/],
    ['where the standings come from', /one mounted volume|carry its own index/],
  ] as ReadonlyArray<[string, RegExp]>) {
    assert.match(method, pattern, `${name} is no longer published anywhere`);
  }
});

test('the methodology page renders that rule, and the board links to it', () => {
  const methodology = copy('src/app/(site)/methodology/page.tsx');
  assert.match(methodology, /id="leaderboard"/, 'the section the board links to does not exist');
  assert.match(methodology, /LEADERBOARD_METHOD\.map/, 'the page writes the rule out again instead of rendering it');

  const board = copy(BOARD);
  assert.match(board, /LEADERBOARD_METHOD_HREF/);
  assert.equal(LEADERBOARD_METHOD_HREF, '/methodology#leaderboard');
  /* Twice in the render — once by the figures, once under them — so a
     reader who scrolls past the first still meets the second. */
  assert.equal((board.match(/href=\{LEADERBOARD_METHOD_HREF\}/g) ?? []).length, 2);
});

/*
 * What a figure would be misread without stays on the board. Everything
 * else is a link away. The test is the line between those two.
 */
test('the board still carries what its figures cannot be read without', () => {
  const source = copy(BOARD);
  for (const [name, pattern] of [
    ['the agreed empty sentence', /NO_QUALIFYING_SETTLEMENTS/],
    ['the unavailable state', /outcomes\.reason/],
    ['the responsiveness unavailable state', /responsiveness\.reason/],
    ['the window', /periodOf\(view\)\.value/],
    ['the ranking threshold', /At least \$\{MIN_RESPONSIVENESS_CHECKS\} checks/],
    ['how much was read', /agents read/],
    ['how fresh it is', /updated \$\{timestamp\(lastRead\)\}/],
    ['the outcomes sample it was drawn from', /indexed, \$\{formatCount\(outcomes\.data\.coverage\.qualifyingJobs\)\} qualifying/],
    ['what the rate is not', /ANSWER_RATE_DOES_NOT_MEAN/],
    ['the per-row sample', /formatObservedSpan\(row\.observedDays\)/],
    ['the below-minimum list', /too few checks to rank/],
  ] as ReadonlyArray<[string, RegExp]>) {
    assert.match(source, pattern, `${name} must stay on the board`);
  }
});

test('the board still combines nothing into one figure', () => {
  const source = copy(BOARD);
  assert.doesNotMatch(source, /overall score:|composite|combined rank/i);
  /* And no period control, because no period can be applied. */
  assert.doesNotMatch(source, /name="period"/);
});
