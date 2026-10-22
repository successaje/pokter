import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { attemptFingerprint, canonicalTokenId, type HireAttemptInput } from '../src/lib/builder/diagnostics/attempt';
import {
  applyHireAttemptSchema,
  attemptSaltIn,
  readHireAttemptsIn,
  recordHireAttemptIn,
} from '../src/lib/builder/diagnostics/attempt-sql';
import { authoriseAgentOwner } from '../src/lib/builder/diagnostics/authorise';
import { deliveryFailuresFrom } from '../src/lib/builder/diagnostics/delivery-failures';
import { buildBuilderDiagnostics, DELIVERY_LIST_LIMIT, type DiagnosticsInput } from '../src/lib/builder/diagnostics/report';
import { WITHHELD_REASON_TEXT } from '../src/lib/builder/diagnostics/withheld';
import { summariseEconomicHistory } from '../src/lib/erc8183/economic-history';
import { sanitiseFailureReason } from '../src/lib/erc8183/delivery-diagnostics';
import { TEAM_WALLETS, teamAddressSet } from '../src/lib/team/wallets';
import type { HiredJob } from '../src/lib/erc8183/types';

/*
 * The whole point of this panel is that it tells one builder the truth
 * about one agent. Two things can break that, and both have broken
 * something on this marketplace before: Pokter's own traffic being counted
 * as customers, and a figure reaching the wrong owner. So the report is
 * assembled here from real rows in a real database, through the real
 * ownership gate, for two builders at once.
 */

const NOW = Date.parse('2026-10-22T12:00:00.000Z');
const BUILDER_A = '0x1111111111111111111111111111111111111111';
const BUILDER_B = '0x2222222222222222222222222222222222222222';
const AGENT_A = { chainId: 56, tokenId: '45422' };
const AGENT_B = { chainId: 56, tokenId: '45423' };
const OUTSIDE_BUYER = '0x9999999999999999999999999999999999999999';
const TEAM = TEAM_WALLETS[0].address;

function temporary() {
  const dir = mkdtempSync(join(tmpdir(), 'pokter-diagnostics-'));
  const db = new DatabaseSync(join(dir, 'hire-attempts.db'));
  applyHireAttemptSchema(db);
  return { db, dir };
}

function row(over: Partial<HireAttemptInput> & { fingerprint: string }): HireAttemptInput {
  return {
    chainId: 56,
    tokenId: AGENT_A.tokenId,
    escrowChainId: null,
    source: 'buyer',
    outcome: 'stopped',
    code: 'no-price-skill',
    layer: 'seller',
    sellerReason: null,
    at: '2026-10-20T10:00:00.000Z',
    ...over,
  };
}

function job(over: Partial<HiredJob>): HiredJob {
  return {
    id: `97:${over.jobId ?? '1'}`,
    jobId: '1',
    chainId: 97,
    isTestnet: true,
    agentChainId: 56,
    agentTokenId: AGENT_A.tokenId,
    agentName: 'Test agent',
    provider: '0x8888888888888888888888888888888888888888',
    client: OUTSIDE_BUYER as `0x${string}`,
    task: 'a brief',
    budgetRaw: '1000000000000000000',
    expiredAt: '2026-10-10T00:00:00.000Z',
    hiredAt: '2026-10-08T00:00:00.000Z',
    hireTxHash: null,
    status: 'COMPLETED',
    statusCheckedAt: '2026-10-11T00:00:00.000Z',
    deliverableUrl: null,
    settleTxHash: null,
    ...over,
  };
}

function report(input: Partial<DiagnosticsInput> & { owner: string; agent: { chainId: number; tokenId: string } }) {
  const decision = authoriseAgentOwner({
    sessionOwner: input.owner,
    registryOwner: input.owner,
    chainId: input.agent.chainId,
    tokenId: input.agent.tokenId,
  });
  assert.equal(decision.ok, true);
  if (!decision.ok) throw new Error('unreachable');
  return buildBuilderDiagnostics(decision.proof, {
    now: NOW,
    attemptsReadable: true,
    attempts: [],
    hireFlowOpens: 0,
    fundedInWindow: 0,
    teamFunded: 0,
    history: summariseEconomicHistory([], NOW),
    deliveryFailures: [],
    pokterCheck: null,
    agentWallet: null,
    protocols: [],
    ...input,
  });
}

test('a failed hire reaches the agent’s own builder, with a fix to act on', () => {
  const { db, dir } = temporary();
  try {
    const salt = attemptSaltIn(db);
    const print = (tokenId: string, brief: string) =>
      attemptFingerprint({ salt, clientKey: '203.0.113.8', chainId: 56, tokenId, brief, day: '2026-10-20' });

    /*
     * The controlled failure: a buyer asked agent A for a price and its card
     * declares no negotiate skill, so it cannot sign one. Agent B, owned by
     * somebody else, is quoting happily.
     */
    recordHireAttemptIn(db, row({ fingerprint: print(AGENT_A.tokenId, 'price my rebalance') }));
    recordHireAttemptIn(
      db,
      row({ fingerprint: print(AGENT_B.tokenId, 'price my rebalance'), tokenId: AGENT_B.tokenId, outcome: 'quoted', code: null, layer: null }),
    );

    const since = '2026-10-01T00:00:00.000Z';
    const mine = report({
      owner: BUILDER_A,
      agent: AGENT_A,
      attempts: readHireAttemptsIn(db, { ...AGENT_A, since }),
    });

    assert.equal(mine.demand.attempts, 1);
    assert.equal(mine.demand.stopped, 1);
    const [stopped] = mine.demand.stoppedByCode;
    assert.equal(stopped.code, 'no-price-skill');
    assert.equal(stopped.layer, 'seller');
    assert.equal(stopped.attempts, 1);
    assert.equal(stopped.of, 1, 'the denominator travels with the count');
    assert.match(stopped.remediation?.reason ?? '', /negotiate skill/, 'the fix has to name what is missing');
    assert.equal(stopped.remediation?.fix.href, '/build/integration#skills', 'and link the section that explains it');
    assert.equal(mine.headline.id, 'buyers-stopped');
    assert.match(mine.headline.title, /1 of 1 buyer price request stopped on no-price-skill/);

    /* The other builder's agent is quoting; their panel says so and never
       mentions somebody else's failure. */
    const theirs = report({
      owner: BUILDER_B,
      agent: AGENT_B,
      attempts: readHireAttemptsIn(db, { ...AGENT_B, since }),
    });
    assert.equal(theirs.demand.attempts, 1);
    assert.equal(theirs.demand.stopped, 0);
    assert.deepEqual(theirs.demand.stoppedByCode, []);
    assert.equal(theirs.headline.id, 'nothing-failing');
    assert.ok(!JSON.stringify(theirs).includes('no-price-skill'), 'no trace of the other agent’s failure');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Pokter’s own probes, trials, team hires and demos do not inflate demand', () => {
  const { db, dir } = temporary();
  try {
    const salt = attemptSaltIn(db);
    const print = (brief: string) =>
      attemptFingerprint({ salt, clientKey: '203.0.113.8', chainId: 56, tokenId: AGENT_A.tokenId, brief, day: '2026-10-20' });

    /* One real buyer, and one free trial — the builder's own test, or an
       assistant looking. The trial must not read as a customer. */
    recordHireAttemptIn(db, row({ fingerprint: print('a buyer asking'), outcome: 'quoted', code: null, layer: null }));
    recordHireAttemptIn(db, row({ fingerprint: print('a trial run'), source: 'trial', outcome: 'quoted', code: null, layer: null }));

    const demo = job({ jobId: '2', id: '97:2', status: 'COMPLETED' });
    const jobs = [
      job({ jobId: '1', id: '97:1', status: 'COMPLETED' }),
      demo,
      job({ jobId: '3', id: '97:3', client: TEAM, status: 'COMPLETED' }),
      /* Buyer and seller the same wallet: an operator paying their own agent. */
      job({ jobId: '4', id: '97:4', client: '0x8888888888888888888888888888888888888888', status: 'COMPLETED' }),
    ];
    const history = summariseEconomicHistory(jobs, NOW, { isLifecycleDemo: (j) => j === demo });

    const diagnostics = report({
      owner: BUILDER_A,
      agent: AGENT_A,
      attempts: readHireAttemptsIn(db, { ...AGENT_A, since: '2026-10-01T00:00:00.000Z' }),
      history,
      fundedInWindow: 0,
      teamFunded: 1,
      /* The sweep's latest scheduled price request, which failed. It is
         Pokter's traffic and must never be counted as an ask. */
      pokterCheck: { code: 'timeout', detail: null, sellerReason: null, observedAt: '2026-10-22T04:00:00.000Z' },
    });

    assert.equal(diagnostics.demand.attempts, 1, 'one buyer asked; the trial is not a buyer');
    assert.equal(diagnostics.demand.quoted, 1);
    assert.equal(diagnostics.delivery.outsideJobs, 1, 'the demo, the team hire and the self-hire are all out');

    const by = new Map(diagnostics.excluded.map((item) => [item.id, item]));
    assert.equal(by.get('trials')?.count, 1);
    assert.equal(by.get('team-funded')?.count, 1);
    assert.equal(by.get('self-hire')?.count, 1);
    assert.equal(by.get('lifecycle-demos')?.count, 1);
    /* Not 0, and not 1: Pokter keeps one row per agent and replaces it each
       sweep, so there is no total to print. A 0 would claim Pokter has never
       called this agent, which is the opposite of true. */
    assert.equal(by.get('pokter-check')?.count, null);
    for (const item of diagnostics.excluded) {
      assert.ok(item.why.length > 40, `${item.id} has to say why it was left out`);
    }

    /* The probe is reported on its own, labelled, with its own fix — never
       folded into the demand figures above it. */
    assert.equal(diagnostics.pokterCheck?.code, 'timeout');
    assert.equal(diagnostics.pokterCheck?.remediation?.transient, true);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('“no buyer has tried” is an answer, not a row of zeroes', () => {
  const quiet = report({ owner: BUILDER_A, agent: AGENT_A, attempts: [], attemptsReadable: true });
  assert.equal(quiet.demand.noBuyerYet, true);
  assert.equal(quiet.demand.measurable, true);
  assert.equal(quiet.headline.id, 'no-buyer-yet');
  assert.match(quiet.headline.body, /Nothing here is failing/);

  /*
   * And an unreadable store is a third state, not the same zero. Saying "no
   * buyer asked" because SQLite was busy is a claim about the agent that
   * the failed read cannot support.
   */
  const unknown = report({ owner: BUILDER_A, agent: AGENT_A, attempts: [], attemptsReadable: false });
  assert.equal(unknown.demand.noBuyerYet, false);
  assert.equal(unknown.demand.measurable, false);
  assert.equal(unknown.headline.id, 'not-measurable');
});

test('a blocked quote path outranks a quiet month, because it explains it', () => {
  /* An agent that cannot sign a price for Pokter cannot sign one for a
     buyer: the hire page calls the same endpoint. "No demand" and "no
     demand reaches you" look identical from outside, and only one of them
     is the builder's to fix. */
  const blocked = report({
    owner: BUILDER_A,
    agent: AGENT_A,
    attempts: [],
    pokterCheck: { code: 'auth-required', detail: 'HTTP 403', sellerReason: null, observedAt: '2026-10-22T04:00:00.000Z' },
  });
  assert.equal(blocked.headline.id, 'blocked-before-any-buyer');
  assert.equal(blocked.headline.remediation?.fix.href, '/build/integration#identity');

  /* A transient failure does not take the headline: there may be nothing to change. */
  const flaky = report({
    owner: BUILDER_A,
    agent: AGENT_A,
    attempts: [],
    pokterCheck: { code: 'rate-limited', detail: null, sellerReason: null, observedAt: '2026-10-22T04:00:00.000Z' },
  });
  assert.equal(flaky.headline.id, 'no-buyer-yet');
});

test('a funded job left to lapse is listed, with the job and the fix', () => {
  const lapsed = job({ jobId: '7', id: '97:7', status: 'EXPIRED' });
  const refusedJob = job({ jobId: '8', id: '97:8', status: 'FUNDED' });
  const pokterOwed = job({ jobId: '9', id: '97:9', status: 'EXPIRED', provider: TEAM });
  const demo = job({ jobId: '10', id: '97:10', status: 'EXPIRED' });

  const failures = deliveryFailuresFrom({
    jobs: [lapsed, refusedJob, pokterOwed, demo],
    now: NOW,
    isLifecycleDemo: (j) => j === demo,
    teamWallets: teamAddressSet(),
    noticeFor: (j) =>
      j === refusedJob
        ? { status: 'rejected', reason: 'brief names no pool address', lastAt: '2026-10-09T00:00:00.000Z' }
        : null,
  });

  assert.deepEqual(
    failures.map((f) => `${f.kind}:${f.jobId}`),
    /* Newest first, and only two of the four: a job Pokter itself owed the
       delivery for is not the builder's miss, and a demonstration is neither. */
    ['lapsed:7', 'refused-funded-job:8'],
  );

  const diagnostics = report({ owner: BUILDER_A, agent: AGENT_A, deliveryFailures: failures });
  assert.equal(diagnostics.delivery.lapsed, 1);
  assert.equal(diagnostics.delivery.refused, 1);
  assert.equal(diagnostics.delivery.failures[0].remediation.fix.href, '/build/integration#lifecycle');
  assert.equal(diagnostics.delivery.failures[1].remediation.fix.href, '/build/integration#reading-a-job');
  assert.equal(diagnostics.delivery.failures[1].sellerReason, 'brief names no pool address');
  assert.equal(diagnostics.headline.id, 'deliveries-lapsed', 'a lapsed deadline is the thing to read first here');
});

test('a seller reason that hides a credential is withheld whole, not trimmed', () => {
  const leaky = 'refused\napi_key: sk-live-9f3c2a mnemonic follows and continues here';
  assert.equal(sanitiseFailureReason(leaky), null, 'the shared sanitiser refuses to bound this');

  const refusedJob = job({ jobId: '11', id: '97:11', status: 'FUNDED' });
  const failures = deliveryFailuresFrom({
    jobs: [refusedJob],
    now: NOW,
    isLifecycleDemo: () => false,
    teamWallets: teamAddressSet(),
    noticeFor: () => ({ status: 'rejected', reason: leaky, lastAt: '2026-10-09T00:00:00.000Z' }),
  });

  assert.equal(failures[0].sellerReason, WITHHELD_REASON_TEXT);
  const serialised = JSON.stringify(report({ owner: BUILDER_A, agent: AGENT_A, deliveryFailures: failures }));
  assert.ok(!serialised.includes('sk-live-9f3c2a'), 'no part of a secret reaches the report');
  assert.ok(serialised.includes(WITHHELD_REASON_TEXT), 'and the builder is told it was withheld, not that nothing was said');
});

test('the quote-to-funding stage is reported as unmeasured, not estimated', () => {
  /*
   * Two figures stood here and both are gone. "Priced and not funded" was
   * signed prices minus funded jobs over one window, which is not a join:
   * a job funded from a price signed just before the window makes the gap
   * look larger than it is. And `signedPrices` itself went with it, because
   * `demand.quoted` two rows above counts the same funnel stage from the
   * attempt rows — filtered to the buyer path, folded per ask rather than
   * per re-ask — so the second figure was the same event measured worse.
   *
   * Keeping a half-attributable count directly above an entry saying the
   * attribution is impossible would only invite the reader to do the
   * subtraction by hand, with none of the caveats attached.
   */
  const d = report({ owner: BUILDER_A, agent: AGENT_A, fundedInWindow: 1 });
  assert.deepEqual(Object.keys(d.funding), ['fundedInWindow'], 'nothing left to subtract from');

  const serialised = JSON.stringify(d);
  for (const gone of ['pricedNotFunded', 'priced-not-funded', 'signedPrices', 'signed-prices']) {
    assert.ok(!serialised.includes(gone), `${gone} must not survive anywhere in the report`);
  }
  assert.notEqual(d.headline.id, 'priced-not-funded');
  assert.ok(!d.definitions.some((m) => m.id === 'signed-prices' || m.id === 'priced-not-funded'));

  /* The gap does not disappear with the figure: it becomes unmeasured,
     which is a different and more honest claim, and it is said where a
     builder reads it rather than only in a pull request. */
  assert.ok(
    d.unmeasured.some((line) => /got a price and then did not fund/.test(line)),
    'cutting the figure must not make the gap disappear',
  );
  assert.ok(
    d.unmeasured.some((line) => /negotiation hash/.test(line)),
    'and it should say why Pokter cannot join the two',
  );
  /* The one input refusal that is deliberately not recorded is disclosed
     rather than left as an unexplained asymmetry. */
  assert.ok(d.unmeasured.some((line) => /2,000-character/.test(line)));
});

test('every published figure carries its window and its denominator', () => {
  const diagnostics = report({ owner: BUILDER_A, agent: AGENT_A });
  assert.ok(diagnostics.definitions.length >= 7);
  for (const metric of diagnostics.definitions) {
    assert.ok(metric.counts.length > 30, `${metric.id} must say what it counts`);
    assert.match(metric.window, /day|cutoff/i, `${metric.id} must state its window`);
    assert.ok(metric.source.length > 10, `${metric.id} must say where it is read from`);
    if (metric.denominator !== null) {
      assert.ok(metric.denominator.length > 10, `${metric.id} has a rate with an unstated denominator`);
    }
  }
  /* The rates among them name a denominator; the counts say they are counts. */
  const rates = diagnostics.definitions.filter((m) => m.denominator !== null).map((m) => m.id);
  assert.deepEqual(rates.sort(), ['buyer-attempts-quoted', 'buyer-attempts-stopped', 'delivered-and-settled']);
  assert.ok(diagnostics.unmeasured.length >= 4, 'what Pokter cannot measure is listed, not left blank');
  assert.ok(
    diagnostics.unmeasured.some((line) => /wallet/i.test(line)),
    'the buyer-wallet blind spot is the one most likely to be mistaken for data',
  );
});

test('retries are shown as requests without becoming extra attempts', () => {
  const { db, dir } = temporary();
  try {
    const salt = attemptSaltIn(db);
    const fingerprint = attemptFingerprint({
      salt,
      clientKey: '203.0.113.8',
      chainId: 56,
      tokenId: AGENT_A.tokenId,
      brief: 'price my rebalance',
      day: '2026-10-20',
    });
    for (const at of ['2026-10-20T10:00:00.000Z', '2026-10-20T10:01:00.000Z', '2026-10-20T10:02:00.000Z']) {
      recordHireAttemptIn(db, row({ fingerprint, at, code: 'timeout', layer: 'network' }));
    }

    const diagnostics = report({
      owner: BUILDER_A,
      agent: AGENT_A,
      attempts: readHireAttemptsIn(db, { ...AGENT_A, since: '2026-10-01T00:00:00.000Z' }),
    });
    assert.equal(diagnostics.demand.attempts, 1, 'one ask, three requests');
    assert.equal(diagnostics.demand.stoppedByCode[0].attempts, 1);
    assert.equal(diagnostics.demand.stoppedByCode[0].tries, 3);
    assert.equal(diagnostics.demand.stoppedByCode[0].of, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a decline of a buyer’s own brief is not described as a decline of Pokter’s check', () => {
  /*
   * `hireBlocker` speaks for an agent's public listing, where a decline is
   * always of Pokter's generic scheduled request — "a buyer's brief in the
   * format it asks for may still be quoted". On this panel the decline is
   * of a brief a buyer actually sent, so that sentence is the opposite of
   * what happened and would leave a builder waiting for a customer who has
   * already been and gone.
   */
  const declined = (sellerReason: string | null) =>
    report({
      owner: BUILDER_A,
      agent: AGENT_A,
      attempts: [
        {
          fingerprint: sellerReason ? 'a' : 'b',
          chainId: 56,
          tokenId: AGENT_A.tokenId,
          escrowChainId: null,
          source: 'buyer',
          outcome: 'stopped',
          code: 'seller-declined',
          layer: 'seller',
          sellerReason,
          tries: 1,
          firstAt: '2026-10-20T10:00:00.000Z',
          lastAt: '2026-10-20T10:00:00.000Z',
        },
      ],
    });

  const withWords = declined('lp_tier_plan needs the token address');
  const reason = withWords.demand.stoppedByCode[0].remediation?.reason ?? '';
  assert.match(reason, /a buyer sent through the hire page/);
  assert.doesNotMatch(reason, /generic price request/, 'that is the scheduled check, not this');
  assert.equal(
    withWords.demand.stoppedByCode[0].remediation?.fix.href,
    '/build/integration#skills',
    'the kit link is still hireBlocker’s — the taxonomy is reused, only the sentence changes',
  );

  /*
   * The silent case is told apart, because it is the actionable one. Until
   * 22 October a refusal with nothing readable attached was not treated as
   * a refusal at all: 56/269228 answered `seller-declined` with no words
   * and the brief went through the check it had just failed. It blocks the
   * hire now, which makes the missing reason the only thing standing
   * between that buyer and a brief they could have fixed.
   */
  const silent = declined(null);
  const quiet = silent.demand.stoppedByCode[0].remediation?.reason ?? '';
  assert.match(quiet, /gave no reason/);
  assert.match(quiet, /Return a reason/);
  assert.notEqual(quiet, reason, 'a silent no and a reasoned no are different things to fix');
  assert.match(silent.headline.body, /gave no reason/, 'and it is what the builder reads first');
});

test('the split holds at mainnet scale, not just on a handful of rows', () => {
  const { db, dir } = temporary();
  try {
    const salt = attemptSaltIn(db);
    /*
     * Pokter lists around 77 mainnet agents and probes roughly 55 of them
     * on a sweep, so the shape that matters is many agents with a few rows
     * each, not one agent with many. The failure this guards against is a
     * read that forgets its scope: at this size a missing WHERE clause
     * still returns plausible-looking numbers, which is exactly how one
     * would survive review.
     */
    const AGENTS = 77;
    for (let i = 0; i < AGENTS; i += 1) {
      const tokenId = String(100000 + i);
      const print = (brief: string) =>
        attemptFingerprint({ salt, clientKey: `203.0.113.${i % 250}`, chainId: 56, tokenId, brief, day: '2026-10-20' });
      // Two buyer asks, the first tried three times, plus a trial, per agent.
      for (let n = 0; n < 3; n += 1) {
        recordHireAttemptIn(db, row({ fingerprint: print('ask one'), tokenId, code: 'seller-declined' }));
      }
      recordHireAttemptIn(db, row({ fingerprint: print('ask two'), tokenId, outcome: 'quoted', code: null, layer: null }));
      recordHireAttemptIn(db, row({ fingerprint: print('a trial'), tokenId, source: 'trial' }));
    }

    const mine = readHireAttemptsIn(db, { chainId: 56, tokenId: '100000', since: '2026-10-01T00:00:00.000Z' });
    assert.equal(mine.length, 3, '2 buyer asks and 1 trial for this agent, out of 231 rows across 77');
    const diagnostics = report({ owner: BUILDER_A, agent: { chainId: 56, tokenId: '100000' }, attempts: mine });
    assert.equal(diagnostics.demand.attempts, 2, 'the other 76 agents’ buyers are not this builder’s');
    assert.equal(diagnostics.demand.quoted, 1);
    assert.equal(diagnostics.demand.stopped, 1);
    assert.equal(diagnostics.demand.stoppedByCode[0].tries, 3, 'the retries stayed inside their own attempt');
    assert.equal(diagnostics.demand.stoppedByCode[0].of, 2);
    assert.equal(diagnostics.excluded.find((e) => e.id === 'trials')?.count, 1);

    // Every agent reads the same shape, and none reads another's.
    const shapes = new Set<string>();
    for (let i = 0; i < AGENTS; i += 1) {
      const rows = readHireAttemptsIn(db, { chainId: 56, tokenId: String(100000 + i), since: '2026-10-01T00:00:00.000Z' });
      shapes.add(`${rows.length}:${rows.filter((r) => r.source === 'buyer').length}`);
    }
    assert.deepEqual([...shapes], ['3:2']);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a stored failure a buyer’s own signed price disproves does not take the headline', () => {
  /*
   * The sweep asks every agent the same generic question, and some answer it
   * without a price because it names no wallet or token. `decideHireBlocker`
   * already refuses to call that a blocker once a buyer's own brief has been
   * signed for a payable price — Vitals said "answers negotiate, but not
   * with a signed quote" while it was signing quotes for real briefs.
   *
   * This panel read the stored failure on its own and promoted it to "no
   * buyer can get a price from this agent", on the same report that listed
   * the buyer who got one. Two Pokter surfaces saying opposite things about
   * one agent is worse than either being wrong alone: the builder cannot
   * tell which of them to act on.
   */
  const quoted = {
    fingerprint: 'quoted-ask',
    chainId: 56,
    tokenId: AGENT_A.tokenId,
    escrowChainId: 56,
    source: 'buyer' as const,
    outcome: 'quoted' as const,
    code: null,
    layer: null,
    sellerReason: null,
    tries: 1,
    firstAt: '2026-10-21T09:00:00.000Z',
    lastAt: '2026-10-21T09:00:00.000Z',
  };
  const failure = { code: 'no-quote', detail: null, sellerReason: null, observedAt: '2026-10-18T09:00:00.000Z' };

  const outranked = report({
    owner: BUILDER_A,
    agent: AGENT_A,
    attempts: [quoted],
    pokterCheck: { ...failure, outranked: true },
    pokterCheckedAt: failure.observedAt,
  });
  assert.notEqual(outranked.headline.id, 'blocked-before-any-buyer', 'the buyer who got a price disproves it');
  assert.equal(outranked.headline.id, 'nothing-failing');
  assert.equal(outranked.pokterCheck?.outranked, true, 'still reported, with what it is true of');
  assert.equal(outranked.pokterCheck?.code, 'no-quote', 'and not hidden: no price shows on the public card either way');

  /* Unoutranked it is still the headline, so the guard cannot swallow the
     case the headline was written for. */
  const blocking = report({
    owner: BUILDER_A,
    agent: AGENT_A,
    attempts: [],
    pokterCheck: { ...failure, outranked: false },
    pokterCheckedAt: failure.observedAt,
  });
  assert.equal(blocking.headline.id, 'blocked-before-any-buyer');
  assert.equal(blocking.pokterCheck?.outranked, false);
});

test('an agent Pokter has never checked is not reported as one that passed', () => {
  /*
   * `pokterCheck: null` was three facts wearing one shape — the last
   * scheduled request succeeded, no scheduled request has ever been made,
   * and the probe store would not open — and the panel said "the last
   * scheduled request got a usable signed price from this agent" for all
   * three. For an agent no sweep has reached, that reports a measurement
   * which never happened, the one thing this panel exists not to do.
   * `pokterCheckedAt` is what separates them.
   */
  const unchecked = report({ owner: BUILDER_A, agent: AGENT_A, pokterCheck: null, pokterCheckedAt: null });
  assert.equal(unchecked.pokterCheck, null);
  assert.equal(unchecked.pokterCheckedAt, null, 'no evidence a request was ever made');

  const passed = report({
    owner: BUILDER_A,
    agent: AGENT_A,
    pokterCheck: null,
    pokterCheckedAt: '2026-10-22T04:00:00.000Z',
  });
  assert.equal(passed.pokterCheck, null);
  assert.equal(passed.pokterCheckedAt, '2026-10-22T04:00:00.000Z', 'a date is the only thing that licenses "succeeded"');

  /* And the panel reads the date rather than the absence of a failure. */
  const panel = readFileSync(new URL('../src/features/studio/Diagnostics.tsx', import.meta.url), 'utf8');
  assert.match(panel, /d\.pokterCheckedAt \?/, 'the success claim is gated on positive evidence');
  assert.match(panel, /has not checked this agent yet/, 'and the third state is said in words');
});


test('a buyer bounced before the agent was called is still a buyer who asked', () => {
  /*
   * Eight returns in the quote route stood in front of the recorder, and
   * three of them were refusals Pokter issues itself, already classified
   * with a code and a layer. While buyers were being turned away at 400
   * the panel printed "every buyer who asked got a signed price" and
   * "nothing in the quote path is turning buyers away" — affirmatively
   * false, in a reachable state.
   */
  const stopped = (code: string) =>
    report({
      owner: BUILDER_A,
      agent: AGENT_A,
      attempts: [
        {
          fingerprint: code,
          chainId: 56,
          tokenId: AGENT_A.tokenId,
          escrowChainId: null,
          source: 'buyer',
          outcome: 'stopped',
          code: code as never,
          layer: 'input',
          sellerReason: null,
          tries: 1,
          firstAt: '2026-10-20T10:00:00.000Z',
          lastAt: '2026-10-20T10:00:00.000Z',
        },
      ],
    });

  for (const [code, expected] of [
    ['brief-too-short', /publishing the briefs you actually take/],
    ['invalid-task', /did not match the examples your card declares/],
    ['subject-missing', /could not find, in the buyer/],
    ['subject-ambiguous', /named more than one thing/],
    ['brief-declined', /could not turn the buyer/],
  ] as const) {
    const d = stopped(code);
    assert.equal(d.demand.attempts, 1, `${code} is an ask`);
    assert.equal(d.demand.stopped, 1, `${code} is an ask that stopped`);
    assert.equal(d.demand.quoted, 0);
    assert.equal(d.headline.id, 'buyers-stopped', `${code} must not read as "nothing failing"`);
    const fix = d.demand.stoppedByCode[0].remediation;
    assert.ok(fix, `${code} needs a fix, not "Pokter has no specific fix recorded"`);
    assert.match(fix.reason, expected);
    assert.equal(fix.fix.href, '/build/integration#skills');
    assert.equal(d.demand.stoppedByCode[0].layer, 'input');
  }
});

test('one spelling of a registry number, or none', () => {
  /*
   * `/api/hire/quote` accepts any run of digits, so a buyer arriving at
   * `?tokenId=045422` recorded attempts under that literal key while the
   * panel asked for `45422` — the spelling the registry and every link
   * use. The builder saw a quiet month that was not quiet.
   */
  assert.equal(canonicalTokenId('045422'), '45422');
  assert.equal(canonicalTokenId('45422'), '45422');
  assert.equal(canonicalTokenId('  45422 '), '45422');
  assert.equal(canonicalTokenId('000'), '0');
  assert.equal(canonicalTokenId('0'), '0');
  /* A uint256 is 78 decimal digits. The 12-digit cap on the reader was the
     other half of the same split, refusing ids the writer had accepted. */
  assert.equal(canonicalTokenId('1'.repeat(78)), '1'.repeat(78));
  for (const bad of ['', '  ', 'abc', '12a', '-1', '1.0', '1'.repeat(79), null, undefined]) {
    assert.equal(canonicalTokenId(bad), null, `${String(bad)} is not a registry number`);
  }
});

test('attempts written under a padded id are read back by the panel', () => {
  const { db, dir } = temporary();
  try {
    const salt = attemptSaltIn(db);
    const key = canonicalTokenId('045422');
    assert.equal(key, '45422');
    recordHireAttemptIn(
      db,
      row({
        fingerprint: attemptFingerprint({ salt, clientKey: '203.0.113.8', chainId: 56, tokenId: key as string, brief: 'b', day: '2026-10-20' }),
        tokenId: key as string,
      }),
    );
    assert.equal(readHireAttemptsIn(db, { chainId: 56, tokenId: '45422', since: '2026-10-01T00:00:00.000Z' }).length, 1);
    assert.equal(
      readHireAttemptsIn(db, { chainId: 56, tokenId: '045422', since: '2026-10-01T00:00:00.000Z' }).length,
      0,
      'the padded spelling is never a key, so nothing can hide under it',
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});


test('the failure counts are over every failure, not over the listed ones', () => {
  /*
   * The collector cut the list to twenty before the report counted it, so
   * an agent with more than twenty failed deliveries reported exactly
   * twenty however many it had — and nothing on the page said the list was
   * short. A counter that saturates is worse than no counter: it is wrong
   * in the direction that makes the problem look smaller.
   */
  const many = Array.from({ length: 25 }, (_, i) =>
    job({ jobId: String(500 + i), id: `97:${500 + i}`, status: 'EXPIRED', expiredAt: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z` }),
  );
  const failures = deliveryFailuresFrom({
    jobs: many,
    now: NOW,
    isLifecycleDemo: () => false,
    teamWallets: teamAddressSet(),
    noticeFor: () => null,
  });
  assert.equal(failures.length, 25, 'the classifier returns them all and cuts nothing');

  const d = report({ owner: BUILDER_A, agent: AGENT_A, deliveryFailures: failures });
  assert.equal(d.delivery.lapsed, 25, 'counted over all of them');
  assert.equal(d.delivery.totalFailures, 25);
  assert.equal(d.delivery.failures.length, DELIVERY_LIST_LIMIT, 'and the list alone is cut');
  assert.ok(d.delivery.totalFailures > d.delivery.failures.length, 'so the page can say the list is short');
});
