import 'server-only';

import { VENUS_COMPTROLLER, venusClient } from '@/lib/assay/venus';
import { readVenusFactsAt } from '@/lib/delivery/venus-facts';
import {
  CHECKED_POOL,
  VENUS_CHAIN_ID,
  readVenusReportClaim,
  verifyVenusReport,
  type VenusEvidence,
  type VenusHealthSubject,
  type VenusReportVerification,
} from '@/lib/delivery/venus-report-check';
import { specHashOf, venusAcceptanceSpec } from '@/lib/proofrun/acceptance';
import { buildArtifact } from '@/lib/proofrun/artifact';
import { checksFromVerification, headlineFor, stateFromChecks } from '@/lib/proofrun/checks';
import { CRITERIA_VERSION, VERIFIER_VERSION } from '@/lib/proofrun/versions';
import type { AcceptanceSpec, JobRef, VerificationResult } from '@/lib/shared/contracts';

import { scenarioById, type ScenarioMeta } from './catalogue';
import { fixtureById } from './fixtures';

/**
 * Running one scenario, and composing nothing that the verifier has not
 * already decided.
 *
 * Every outcome below comes out of `verifyVenusReport` and is translated by
 * `lib/proofrun/checks`. Nothing here re-compares a figure, and nothing
 * here can turn a `not-verified` into a pass: the state is
 * `stateFromChecks`'s and the headline is `headlineFor`'s, both derived
 * from the same rows the view renders, so the summary and the detail cannot
 * come to disagree.
 *
 * What this module does own is **provenance in the prose**. The verifier
 * writes its evidence lines as the contract calls it makes — "Comptroller ·
 * getAccountLiquidity(0x…) at block N" — which is true of a replay and
 * false of a fixture, where no node was contacted at all. Printing those
 * lines under a synthetic run would tell the reader a call happened. So the
 * evidence a fixture reports is written here, from the fixture, and says in
 * its first line that nothing was read.
 */

export type Freshness =
  /** Computed during this request. */
  | { kind: 'fresh'; at: string }
  /**
   * Served from a result this server process already held. Carries the
   * original time rather than now: a reused result labelled with the
   * current clock is the freshness defect, not a fix for it.
   */
  | { kind: 'reused'; at: string; heldForSeconds: number };

/**
 * A run's result, where the run had no escrow job behind it.
 *
 * `VerificationResult.job` is a required `JobRef`, which is right for the
 * delivery path it was written for and cannot be satisfied here: a fixture
 * has no job and a replay of a pasted report has no job either. The one
 * thing not done is inventing a chain id and a job id to fill the field —
 * a receipt naming a job that does not exist is worse than one admitting
 * there is none, and `ProofRunArtifact.job` is already `JobRef | null` for
 * exactly this reason. Every other field is the shared shape unchanged.
 *
 * Widening `VerificationResult.job` to `JobRef | null` belongs in
 * `lib/shared/contracts.ts`, which is changed by agreement rather than
 * edited here.
 */
export type ScenarioResult = Omit<VerificationResult, 'job'> & { job: JobRef | null };

export interface ProofRunView {
  scenario: ScenarioMeta;
  /** What the scenario set up, before anything was checked. */
  setup: string;
  result: ScenarioResult;
  /**
   * Why, in the verifier's own words, at the level of the whole run.
   *
   * Dropped from the first draft of this view, and it was the most
   * informative sentence either path produces. The per-check limitation
   * `checksFromVerification` writes for an unsettled criterion is generic
   * — "nothing in the delivery or the chain reading settled it" — while
   * this says *what* went wrong: that the oracle returned no price, that
   * the node no longer serves the block, that the report named another
   * pool. Without it a reader is told a check did not run and never told
   * why, which is the half of "not verified" that makes it actionable.
   */
  reason: string;
  spec: AcceptanceSpec;
  /** keccak of the sealed receipt. Consistency of these bytes, not correctness. */
  artifactHash: string;
  freshness: Freshness;
  /** How the check is defined, in the verifier's own words. */
  method: string[];
  /** Null when the method describes calls this run did make. Set when it did not. */
  methodNote: string | null;
  tolerances: string[];
  subject: { chainId: number; account: string; blockNumber: string; blockHash: string | null; deployment: string };
}

export type RunOutcome =
  | { ok: true; view: ProofRunView }
  /** A refusal the caller can correct, with the field named. */
  | { ok: false; field: 'scenario' | 'account' | 'block' | 'report' | null; message: string };

export interface RunRequest {
  scenarioId: string;
  /** Replay only: the account the brief named, which is what a report is held to. */
  account?: string;
  /**
   * Replay only: the report under test.
   *
   * There is deliberately no `block` here. The block is read out of the
   * report and the chain is read at that block and no other — it is what
   * `readVenusReportClaim` finds and the only value `readVenusFactsAt` is
   * ever called with. An input beside it would let the page print one
   * block while the comparison used another, which is a page saying
   * something untrue about a computation that was right.
   */
  report?: string;
}

/* ------------------------------------------------------------------ *
 * The spec
 * ------------------------------------------------------------------ */

/**
 * The criteria every run here is judged against.
 *
 * `pokter-asserted` and nothing else. A scenario has no agent signature
 * behind it — a fixture has no agent at all, and a replay of a report the
 * buyer supplies has no quote — so the binding is Pokter's own statement.
 * `venusAcceptanceSpec` already returns that; it is restated here because
 * the alternative, letting a surface choose its own binding, is the defect
 * this feature was written to prevent.
 */
export function scenarioSpec(): AcceptanceSpec {
  return venusAcceptanceSpec({ deployment: VENUS_COMPTROLLER, chainId: VENUS_CHAIN_ID });
}

/* ------------------------------------------------------------------ *
 * Freshness
 * ------------------------------------------------------------------ */

interface CacheEntry {
  view: ProofRunView;
  atMs: number;
}

/**
 * Results this process has already computed, keyed by what would change
 * them.
 *
 * The versions are in the key on purpose. A result computed by one verifier
 * and served after the verifier changed is a result about code that is no
 * longer running, and reusing it silently is how a page comes to describe a
 * rule the product has stopped applying.
 *
 * In this process's memory and nowhere else: it does not survive a restart
 * and it is not shared between machines. The view says so in as many
 * words, because "cached" on its own invites the reader to think it means
 * something durable.
 */
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60_000;

function cacheKey(request: RunRequest): string {
  return [
    request.scenarioId,
    (request.account ?? '').toLowerCase(),
    request.report ?? '',
    CRITERIA_VERSION,
    VERIFIER_VERSION,
  ].join('|');
}

/** Drops the one entry this request would reuse, so "Run again" recomputes. */
export function forgetRun(request: RunRequest): void {
  CACHE.delete(cacheKey(request));
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

const ACCOUNT = /^0x[0-9a-fA-F]{40}$/;

export async function runScenario(request: RunRequest, options: { nowMs?: number } = {}): Promise<RunOutcome> {
  const scenario = scenarioById(request.scenarioId);
  if (!scenario) {
    return { ok: false, field: 'scenario', message: 'That scenario is not one ProofRun supports.' };
  }
  if (scenario.kind === 'live') {
    return {
      ok: false,
      field: 'scenario',
      message:
        'A live test is a funded job. It is never started from here: you review the agent’s signed price and fund it in your own wallet.',
    };
  }

  const key = cacheKey(request);
  const now = options.nowMs ?? Date.now();
  const held = CACHE.get(key);
  if (held && now - held.atMs < CACHE_TTL_MS) {
    return {
      ok: true,
      view: {
        ...held.view,
        freshness: {
          kind: 'reused',
          at: new Date(held.atMs).toISOString(),
          heldForSeconds: Math.max(0, Math.round((now - held.atMs) / 1000)),
        },
      },
    };
  }

  const prepared =
    scenario.kind === 'fixture' ? prepareFixture(scenario) : prepareReplay(request);
  if (!prepared.ok) return prepared;

  const { subject, manifestText, setup } = prepared;
  const claim = readVenusReportClaim(manifestText);

  let evidence: VenusEvidence | null;
  if (prepared.evidence) {
    evidence = prepared.evidence;
  } else if (!claim.ok) {
    /*
     * The report named no block Pokter could read, so there is nothing to
     * read the chain at. Asking for the head instead is the substitution
     * the verifier refuses, so none is made and the claim's own refusal
     * stands.
     */
    evidence = null;
  } else {
    evidence = await readVenusFactsAt(venusClient(), {
      account: subject.account,
      block: claim.claim.block,
    }).catch((error: unknown) => ({
      available: false as const,
      code: 'read-failed' as const,
      detail: error instanceof Error ? `${error.message}.` : 'the node gave no reason.',
    }));
  }

  const verification = verifyVenusReport({
    subject,
    manifestText,
    /*
     * True, and said rather than assumed. For a fixture the bytes are the
     * bytes this file wrote, so there is nothing for them to disagree
     * with; for a replay the buyer supplied the report directly, so there
     * is no on-chain commitment to match it against. Neither case is a
     * delivery whose hash Pokter checked, and the view reports that as a
     * standing limitation rather than letting it pass unmentioned.
     */
    manifestMatchesChain: true,
    claim,
    evidence,
  });

  const view = composeView({ scenario, setup, subject, verification, atMs: now });
  CACHE.set(key, { view, atMs: now });
  return { ok: true, view };
}

type Prepared =
  | {
      ok: true;
      subject: VenusHealthSubject;
      manifestText: string;
      setup: string;
      /** Set for a fixture, where no chain read is made. Null for a replay. */
      evidence: VenusEvidence | null;
    }
  | Extract<RunOutcome, { ok: false }>;

function prepareFixture(scenario: ScenarioMeta): Prepared {
  const fixture = fixtureById(scenario.id);
  if (!fixture) {
    return { ok: false, field: 'scenario', message: 'That fixture is not one ProofRun holds.' };
  }
  return {
    ok: true,
    subject: { chainId: VENUS_CHAIN_ID, account: fixture.account, pool: CHECKED_POOL },
    manifestText: fixture.manifestText,
    setup: fixture.setup,
    evidence: fixture.evidence,
  };
}

function prepareReplay(request: RunRequest): Prepared {
  const account = (request.account ?? '').trim();
  const report = (request.report ?? '').trim();

  if (!ACCOUNT.test(account)) {
    return { ok: false, field: 'account', message: 'Give the account as a 42-character address, starting 0x.' };
  }
  if (!report) {
    return {
      ok: false,
      field: 'report',
      message: 'Paste the report to check. Without one there is nothing to compare against the chain.',
    };
  }

  /*
   * Wrapped in the envelope a delivery arrives in, so this path reads the
   * report through the same reader every other surface uses. A buyer
   * pasting bare JSON and a job delivering it are then checked by the same
   * code, rather than by a second parser that could disagree with it.
   */
  const manifestText = JSON.stringify({
    response: { content: report },
    metadata: { producer: 'Supplied for a ProofRun replay — not read from a delivery' },
  });

  return {
    ok: true,
    subject: { chainId: VENUS_CHAIN_ID, account, pool: CHECKED_POOL },
    manifestText,
    /*
     * No block in this sentence. It is not known until the report has been
     * read, and the block that was actually used appears under Source
     * where it comes from the verdict rather than from an input.
     */
    setup: `Reading Venus’s Core Pool figures for ${account} on chain ${VENUS_CHAIN_ID} at the block the report itself names, and checking the report you supplied against them.`,
    evidence: null,
  };
}

/* ------------------------------------------------------------------ *
 * The view
 * ------------------------------------------------------------------ */

function composeView(input: {
  scenario: ScenarioMeta;
  setup: string;
  subject: VenusHealthSubject;
  verification: VenusReportVerification;
  atMs: number;
}): ProofRunView {
  const { scenario, verification, subject } = input;
  const spec = scenarioSpec();
  const fixture = scenario.kind === 'fixture' ? fixtureById(scenario.id) : null;
  const blockHash = factsBlockHash(fixture?.evidence ?? null);

  const checks = checksFromVerification({ verification, criteria: spec.criteria, blockHash });
  const state = stateFromChecks(checks);
  const checkedAt = new Date(input.atMs).toISOString();

  /*
   * Evidence, rewritten for a fixture.
   *
   * The verifier's own lines name contract calls at a block. Under a
   * synthetic run that sentence is false twice over — no call was made and
   * the block is not a block — and it is the sentence a careful reader
   * would rely on. So a fixture reports where its figures actually came
   * from, and says it first.
   */
  const evidence =
    scenario.kind === 'fixture'
      ? fixtureEvidence(fixture?.evidence ?? null, subject.account)
      : verification.evidence;

  const limitations = [
    ...verification.limitations,
    scenario.kind === 'fixture'
      ? 'This run used a written-down position. Nothing in it was read from BNB Chain, and no live provider was contacted, so it says what the report does with a shape — not what the agent does on chain.'
      : 'The report checked here was supplied directly rather than read from a funded delivery, so Pokter has not confirmed that these bytes are what any agent committed on chain.',
  ];

  const result: ScenarioResult = {
    state,
    job: null,
    checkedAt,
    method: VERIFIER_VERSION,
    headline: headlineFor(checks),
    checks,
    evidence,
    limitations,
    specHash: spec.specHash,
    provenance: scenario.kind === 'fixture' ? 'fixture' : 'simulation',
  };

  const blockNumber = verification.block ?? '—';
  const sealed = buildArtifact({
    provenance: result.provenance,
    job: null,
    subject: {
      chainId: subject.chainId,
      protocol: 'venus-core-pool',
      deployment: VENUS_COMPTROLLER,
      account: subject.account,
      blockNumber,
      blockHash,
    },
    spec,
    /*
     * Null, not a hash of the bytes this page holds. `deliverableHash` is
     * what the agent committed on chain; computing one from a fixture or a
     * pasted report would put a value in the field that looks like a
     * commitment and is not.
     */
    deliverableHash: null,
    briefHash: null,
    checks,
    state,
    checkedAt,
    evidence,
    limitations,
  });

  return {
    scenario,
    setup: input.setup,
    result,
    reason: verification.detail,
    spec,
    artifactHash: sealed.artifactHash,
    freshness: { kind: 'fresh', at: checkedAt },
    method: verification.method,
    methodNote:
      scenario.kind === 'fixture'
        ? 'How the check is defined. No call was made in this run: the figures came from the fixture.'
        : null,
    tolerances: verification.tolerance,
    subject: {
      chainId: subject.chainId,
      account: subject.account,
      blockNumber,
      blockHash,
      deployment: VENUS_COMPTROLLER,
    },
  };
}

function factsBlockHash(evidence: VenusEvidence | null): string | null {
  return evidence && evidence.available ? evidence.facts.blockHash : null;
}

/** Where a fixture's figures came from, which is this repository. */
function fixtureEvidence(evidence: VenusEvidence | null, account: string): string[] {
  const lines = [
    'No node was contacted and no contract was called. Every figure in this run was written into the fixture by hand.',
    `The account ${account} is a label on that written-down position, not a wallet on BNB Chain.`,
  ];
  if (evidence && evidence.available) {
    const facts = evidence.facts;
    lines.push(
      `Fixture state at its labelled block ${facts.block}: health factor ${facts.healthFactor === null ? 'none, no debt' : facts.healthFactor}, debt $${facts.debtUsd.toLocaleString('en-US')}, collateral $${facts.collateralUsd.toLocaleString('en-US')}, ${facts.liquidatable ? 'liquidatable' : 'not liquidatable'}.`,
      'The labelled block is beyond any height BNB Chain has reached, so it cannot be confused with a real one.',
    );
  } else if (evidence) {
    lines.push(
      `The fixture withholds the reading: ${evidence.detail} That is Pokter being unable to see, which is the case this fixture exists to exercise.`,
    );
  }
  return lines;
}

/** The spec hash, recomputed, so a page can show that the criteria it printed are the criteria it names. */
export function recomputedSpecHash(spec: AcceptanceSpec): string {
  return specHashOf(spec.criteria);
}
