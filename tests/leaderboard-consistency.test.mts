import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { withoutClaimedIds } from '../src/lib/erc8183/claimed-ids';
import { oneRowPerJob } from '../src/lib/erc8183/job-dedupe';
import type { HiredJob } from '../src/lib/erc8183/types';
import {
  CONSISTENT_STANDINGS,
  DIVERGENT_STANDINGS,
  parseServingTopology,
  servesFromOneInstance,
  SERVES_FROM_ONE_INSTANCE,
} from '../src/lib/leaderboard/consistency';
import { shareFigure } from '../src/lib/leaderboard/card';
import { buildOutcomeBoard, type OutcomeTests } from '../src/lib/leaderboard/outcomes';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * The file with its comments removed, for assertions about published copy.
 *
 * The comments here quote the claims the page must never make, so that
 * nobody reinstates them — naming the defect is the point of the comment.
 * Scanning the raw text would therefore fail on the very notes that prevent
 * the fault. Same approach, and same reason, as
 * `tests/passkey-signature-verify.test.mts`.
 */
const copy = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/* ------------------------------------------------------------------ *
 * The premise the page's consistency claim rests on, as source facts.
 * ------------------------------------------------------------------ */

/*
 * The page tells visitors they are all served the same standings. That is
 * true because one machine answers, which is a property of the deployment and
 * not of the code — so it is pinned here. Scale out and this fails, which is
 * the point: the wording has to be revisited rather than quietly becoming
 * untrue. `fly machines list` confirmed one machine and `fly volumes list`
 * one volume on 23 October 2026; these three keys are what keep it that way
 * across deploys.
 */
test('fly.toml still describes a single serving instance', () => {
  const topology = parseServingTopology(read('fly.toml'));
  assert.equal(topology.minMachinesRunning, 1, 'more than one machine means more than one index');
  assert.equal(topology.autoStopMachines, 'off');
  assert.equal(topology.mounts, 1, 'a second machine needs a second volume, and a second job index');
  assert.equal(
    servesFromOneInstance(topology),
    SERVES_FROM_ONE_INSTANCE,
    'the constant the page renders from must agree with the deployment',
  );
});

/*
 * Both stores the standings come from have to be on the mounted volume. A
 * path outside `/data` would be on the machine's ephemeral filesystem, where
 * the index resets on deploy — and a leaderboard that silently empties on
 * every release is the same defect as one that reports zero for a failed
 * read.
 */
test('both stores the standings read from live on the mounted volume', () => {
  const fly = read('fly.toml');
  assert.match(fly, /JOB_DB_PATH = '\/data\/jobs\.db'/);
  assert.match(fly, /PROBE_DB_PATH = '\/data\/probes\.db'/);
  assert.match(fly, /destination = '\/data'/);
});

test('the disclosure names the dependency in both directions', () => {
  assert.match(CONSISTENT_STANDINGS, /one machine/i);
  assert.match(CONSISTENT_STANDINGS, /second machine/i, 'the limitation is stated, not only the happy case');
  assert.match(DIVERGENT_STANDINGS, /per-machine/i);
});

/*
 * Three claims the brief rules out, checked against every word the page and
 * its modules publish. They are not established, and a page about data
 * honesty is the last place they should appear.
 */
test('nothing published claims a first, or that nobody has paid an agent', () => {
  const sources = [
    'src/app/(site)/leaderboard/page.tsx',
    'src/app/(site)/leaderboard/opengraph-image.tsx',
    'src/app/(site)/leaderboard/card/[network]/[metric]/[chainId]/[tokenId]/page.tsx',
    'src/app/(site)/leaderboard/card/[network]/[metric]/[chainId]/[tokenId]/opengraph-image.tsx',
    'src/lib/leaderboard/network.ts',
    'src/lib/leaderboard/outcomes.ts',
    'src/lib/leaderboard/responsiveness.ts',
    'src/lib/leaderboard/card.ts',
  ].map((path) => ({ path, text: copy(path) }));

  for (const { path, text } of sources) {
    assert.doesNotMatch(text, /first[- ]ever/i, `${path} must not claim a first`);
    assert.doesNotMatch(text, /no customers/i, `${path} must not claim Pokter has no customers`);
    assert.doesNotMatch(text, /nobody has paid/i, `${path} must not claim nobody has paid an agent`);
    assert.doesNotMatch(text, /\bworld'?s first\b/i, `${path} must not claim a first`);
  }
});

/*
 * The exact sentence a successful query with no matches has to print. It is
 * fixed as a constant because the wording is the claim: "no agents yet" would
 * be a statement about the marketplace and this is a statement about one
 * network, one period and what Pokter has indexed.
 */
test('the empty-result wording is the agreed sentence, and the page uses it', () => {
  const network = read('src/lib/leaderboard/network.ts');
  assert.match(
    network,
    /'No qualifying external settlements found in the indexed data for this network and period\.'/,
  );
  const page = read('src/app/(site)/leaderboard/page.tsx');
  assert.match(page, /NO_QUALIFYING_SETTLEMENTS/, 'the page must render the constant, not its own wording');
  /* And a failed read must say something else entirely. */
  assert.match(page, /DATA_UNAVAILABLE|outcomes\.reason|responsiveness\.reason/);
});

/*
 * An absent measurement says nothing, rather than saying something large.
 *
 * With no job indexed on an escrow there is no refresh time, and the tile
 * rendered "Index last refreshed: Never" — read as Pokter never refreshing
 * its index rather than as this network having nothing to refresh. The same
 * word under "Last check recorded" claimed an agent had never been checked,
 * when the figure is scoped to a 30-day window. Both were found by loading
 * the page, not by reading it.
 */
test('an absent time renders as an em dash, never as "Never"', () => {
  const page = copy('src/app/(site)/leaderboard/page.tsx');
  assert.doesNotMatch(page, /'Never'/, 'an absent time must make no claim about what Pokter has ever done');
});

/*
 * The board's share card withholds a nought the page is free to print.
 *
 * The page can say what a nought means — it carries the sentence naming the
 * network and period, the coverage block and every exclusion behind it. A
 * card carries none of that and travels without it, so "Settled on BNB
 * Chain: 0" arrives in a feed as a claim about the chain rather than about
 * Pokter's index, and that claim is not established.
 */
test('a share card states no bare nought', () => {
  /*
   * The value, not a phrase. The defect that shipped was a figure — a guard
   * written against null while `reduce` over no rows returns 0 — and no scan
   * for wording can see that. `shareFigure` is the rule, so the rule is what
   * is exercised.
   */
  assert.equal(shareFigure(0), '—', 'a nought on a card reads as a claim about the chain');
  assert.equal(shareFigure(null), '—');
  assert.equal(shareFigure(undefined), '—');
  assert.equal(shareFigure(Number.NaN), '—');
  assert.equal(shareFigure(1), '1');
  assert.equal(shareFigure(21), '21');
});

test('both figures on the board card go through that one rule', () => {
  /* They disagreed once: one guarded its nought, the other did not, and the
     one that did not was the figure production served. */
  const card = read('src/app/(site)/leaderboard/opengraph-image.tsx');
  assert.match(card, /value: shareFigure\(settled\)/);
  assert.match(card, /value: shareFigure\(buyers\)/);
  assert.doesNotMatch(card, /String\(settled\)|String\(buyers\)/, 'a raw figure bypasses the rule');
});

/*
 * `import 'server-only'` keeps the loaders out of a test, so the wiring that
 * decides empty-versus-unavailable is asserted as a source fact instead.
 */
test('a failed read returns unavailable rather than an empty board', () => {
  const server = read('src/lib/leaderboard/server.ts');
  /* Both loaders catch, and both catches produce the same state. */
  assert.equal(
    (server.match(/state: 'unavailable'/g) ?? []).length,
    4,
    'each loader needs an unavailable state for a throw and for an unreachable registry',
  );
  assert.match(server, /if \(catalogue\.unreachable\)/);
  assert.doesNotMatch(server, /entries: \[\]/, 'an unreachable registry must never be substituted with no entries');
});

test('the responsiveness loader ranks on the stored window, not a cumulative total', () => {
  const server = read('src/lib/leaderboard/server.ts');
  assert.match(server, /windows: entry\.record\.windows/);
  assert.doesNotMatch(
    server,
    /totalProbes|totalAnswered/,
    'a lifetime total compares agents watched for different lengths of time',
  );
});

/* ------------------------------------------------------------------ *
 * Real persistence: the standings are computed from rows on disk.
 * ------------------------------------------------------------------ */

/** The columns the board reads, as `src/lib/erc8183/store.ts` declares them. */
const JOBS_SCHEMA = `
  CREATE TABLE jobs (
    id                TEXT PRIMARY KEY,
    job_id            TEXT NOT NULL,
    chain_id          INTEGER NOT NULL,
    is_testnet        INTEGER NOT NULL,
    agent_chain_id    INTEGER,
    agent_token_id    TEXT NOT NULL,
    agent_name        TEXT NOT NULL,
    provider          TEXT NOT NULL,
    task              TEXT NOT NULL,
    budget_raw        TEXT NOT NULL,
    expired_at        TEXT NOT NULL,
    hired_at          TEXT NOT NULL,
    hire_tx_hash      TEXT,
    status            TEXT NOT NULL,
    status_checked_at TEXT NOT NULL,
    deliverable_url   TEXT,
    settle_tx_hash    TEXT,
    client            TEXT
  );
`;

/*
 * Pinned against the real schema so this fixture cannot drift from it. A
 * fixture that has quietly stopped matching production is a test that passes
 * while proving nothing.
 */
test('the fixture schema matches the columns the job store declares', () => {
  const store = read('src/lib/erc8183/store.ts');
  for (const column of [
    'chain_id',
    'agent_chain_id',
    'agent_token_id',
    'agent_name',
    'provider',
    'status',
    'status_checked_at',
    'client',
  ]) {
    assert.match(store, new RegExp(`^\\s+${column}\\s`, 'm'), `the jobs table must still have ${column}`);
  }
});

interface Row {
  id: string;
  job_id: string;
  chain_id: number;
  agent_chain_id: number | null;
  agent_token_id: string;
  agent_name: string;
  provider: string;
  status: string;
  status_checked_at: string;
  hired_at: string;
  client: string | null;
}

function toJob(row: Row): HiredJob {
  return {
    id: row.id,
    jobId: row.job_id,
    chainId: row.chain_id,
    isTestnet: row.chain_id === 97,
    agentChainId: row.agent_chain_id ?? undefined,
    agentTokenId: row.agent_token_id,
    agentName: row.agent_name,
    provider: row.provider as HiredJob['provider'],
    client: (row.client ?? undefined) as HiredJob['client'],
    task: 'fixture',
    budgetRaw: '100000000000000000',
    expiredAt: row.hired_at,
    hiredAt: row.hired_at,
    hireTxHash: null,
    status: row.status as HiredJob['status'],
    statusCheckedAt: row.status_checked_at,
    deliverableUrl: null,
    settleTxHash: null,
  };
}

/** The store's own read path: every row, de-duplicated, newest hire first. */
function readJobs(path: string): HiredJob[] {
  const db = new DatabaseSync(path);
  try {
    const rows = db.prepare('SELECT * FROM jobs ORDER BY hired_at DESC').all() as unknown as Row[];
    return oneRowPerJob(withoutClaimedIds(rows.map(toJob)));
  } finally {
    db.close();
  }
}

const AGENT_WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const POKTER = '0x93847647d7eb72a69e162117df6a8697df53edda';
const BUYER = '0x0e98146f00000000000000000000000000009fda';

const persistenceTests: OutcomeTests = {
  teamFunded: (job) => !job.client || job.client.toLowerCase() === POKTER,
  selfHire: (job) => Boolean(job.client) && job.client!.toLowerCase() === String(job.provider ?? '').toLowerCase(),
  lifecycleDemo: () => false,
  relayedDelivery: () => false,
  operatorWallet: (address) => address === POKTER,
};

function standings(path: string) {
  return buildOutcomeBoard(readJobs(path), {
    escrowChainId: 97,
    metric: 'settled-jobs',
    agents: new Map(),
    listedOwners: new Set<string>(),
    reviewerAuthors: new Map(),
    tests: persistenceTests,
  });
}

/*
 * The standings come off disk, and a job written twice must count once.
 *
 * Pokter has two writers that mint different row ids for the same job —
 * `hireAgent` a UUID at funding, the chain indexer `"<chainId>:<jobId>"` — and
 * 13 of 124 rows were duplicates, which made every count built on them about
 * 10% high. A board that counted raw rows would publish a settlement total
 * and a buyer count that are both wrong, and nothing would error. Only
 * running this against a real file shows it.
 */
test('a job written by both writers is counted once, from a real database file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pokter-leaderboard-'));
  const path = join(dir, 'jobs.db');
  try {
    const db = new DatabaseSync(path);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec(JOBS_SCHEMA);
    const insert = db.prepare(
      `INSERT INTO jobs (id, job_id, chain_id, is_testnet, agent_chain_id, agent_token_id, agent_name,
                         provider, task, budget_raw, expired_at, hired_at, hire_tx_hash, status,
                         status_checked_at, deliverable_url, settle_tx_hash, client)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, 'fixture', '100000000000000000', ?, ?, NULL, ?, ?, NULL, NULL, ?)`,
    );
    const row = (
      id: string,
      jobId: string,
      status: string,
      provider: string,
      client: string | null,
      hiredAt: string,
    ) => insert.run(id, jobId, 97, 97, '2618', 'Nagi', provider, hiredAt, hiredAt, status, '2026-10-23T12:26:00.000Z', client);

    /* One job, both writers. Same escrow id, same agent, same hire time. */
    row('11111111-2222-3333-4444-555555555555', '1500', 'COMPLETED', AGENT_WALLET, BUYER, '2026-10-20T00:00:00.000Z');
    row('97:1500', '1500', 'COMPLETED', AGENT_WALLET, BUYER, '2026-10-20T00:00:00.000Z');
    /* A genuinely separate settled job from the same buyer. */
    row('97:1501', '1501', 'COMPLETED', AGENT_WALLET, BUYER, '2026-10-21T00:00:00.000Z');
    /* One Pokter couriered, which must not reach the settled count. */
    row('97:1502', '1502', 'COMPLETED', POKTER, BUYER, '2026-10-21T06:00:00.000Z');
    db.close();

    const raw = new DatabaseSync(path);
    const rawCount = (raw.prepare('SELECT COUNT(*) AS n FROM jobs').get() as unknown as { n: number }).n;
    raw.close();
    assert.equal(rawCount, 4, 'four rows are on disk');

    const board = standings(path);
    assert.equal(board.coverage.indexedJobs, 3, 'three jobs, after the duplicate pair collapses');
    assert.equal(board.rows.length, 1);
    assert.equal(board.rows[0].settledJobs, 2, 'not 3: the courier delivery is not the agent’s');
    assert.equal(board.rows[0].externalBuyers, 1);
    assert.equal(board.rows[0].repeatBuyers, 1);
    assert.equal(board.rows[0].courierSettled, 1);

    /*
     * A fresh connection to the same file gives the same standings. This is
     * the durability half of the consistency claim: the figures survive the
     * process that wrote them, which is what makes them the same for a
     * visitor after a restart as before it.
     */
    const again = standings(path);
    assert.deepEqual(
      again.rows.map((r) => [r.agent.key, r.settledJobs, r.externalBuyers, r.repeatBuyers]),
      board.rows.map((r) => [r.agent.key, r.settledJobs, r.externalBuyers, r.repeatBuyers]),
    );
    assert.equal(again.coverage.lastRefreshedAt, board.coverage.lastRefreshedAt);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty but readable database yields no rows and still reports coverage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pokter-leaderboard-empty-'));
  const path = join(dir, 'jobs.db');
  try {
    const db = new DatabaseSync(path);
    db.exec(JOBS_SCHEMA);
    db.close();

    const board = standings(path);
    assert.deepEqual(board.rows, []);
    assert.equal(board.coverage.indexedJobs, 0);
    assert.equal(board.coverage.qualifyingJobs, 0);
    /*
     * Null, not a date. A board with nothing in it must not stamp itself with
     * the moment it was rendered, which would claim Pokter had just re-read
     * chain state.
     */
    assert.equal(board.coverage.lastRefreshedAt, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
