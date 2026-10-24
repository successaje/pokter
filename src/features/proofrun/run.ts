import { VENUS_CHAIN_ID } from '@/lib/delivery/venus-report-check';
import { VENUS_COMPTROLLER } from '@/lib/assay/venus';
import { venusAcceptanceSpec } from '@/lib/proofrun/acceptance';
import { runFixture } from '@/lib/proofrun/fixture-run';
import { artifactHref, type ProofRun } from '@/lib/proofrun/run';
import { remediationForRun, REMEDIATION_PREAMBLE, type Remediation } from '@/lib/proofrun/remediation';
import { KIND_DISCLOSURE, scenarioById, type Scenario } from '@/lib/proofrun/scenarios';
import { CRITERIA_VERSION, VERIFIER_VERSION } from '@/lib/proofrun/versions';
import type { AcceptanceSpec, JobRef, VerificationResult } from '@/lib/shared/contracts';

import { FIXTURE_SETUP, FIXTURE_SOURCE, fixtureFor } from './fixtures';

/**
 * One run, in the shape the results view reads — whether it came from a
 * scenario on this page or from a job somebody funded.
 *
 * Both go through `proofRun`, so the checks, the state, the headline and
 * the sealed receipt are the library's in either case and nothing here
 * re-decides any of them. What this adds is the framing the two cases do
 * not share: a fixture needs its synthetic nature said before a reader
 * meets a table of figures, and a delivered job needs its job named and
 * its receipt linked.
 *
 * `provenance` is the discriminant the view reads, not `scenario`. It
 * comes from `proofRun` and a surface cannot set it, so a page cannot
 * draw customer work as a fixture or the reverse by getting a local flag
 * wrong.
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

export interface ProofRunView {
  /** The scenario this came from, when it came from one. Null for a funded job. */
  scenario: Scenario | null;
  /** What ran, for the header. */
  title: string;
  /** The particular figures this run was against, above the table. */
  setup: string;
  /** Where those figures are written down. Null when they came from the chain. */
  source: string | null;
  result: VerificationResult;
  /**
   * Why, in the checker's own words, at the level of the whole run.
   *
   * The per-check limitations are generic — "nothing in the delivery or
   * the chain reading settled it" — where this says which thing it was.
   * It is the same object the checker produced, carried through
   * `ProofRun`, not a second comparison.
   */
  reason: string;
  /** What would make an unverifiable run checkable, and whose job that is. */
  remediation: (Remediation & { preamble: string }) | null;
  spec: AcceptanceSpec;
  /** keccak of the sealed receipt. Consistency of these bytes, not correctness. */
  artifactHash: string;
  /** Where the receipt itself can be fetched. Null when there is no job to key it by. */
  artifactHref: string | null;
  freshness: Freshness;
  /** How the check is defined, in the checker's own words. */
  method: string[];
  /** The tolerances, numerically, as the checker applied them. */
  tolerances: string[];
  /** Set when the method describes calls this run did not make. */
  methodNote: string | null;
  /** Set when the evidence lines name calls this run did not make. */
  evidenceNote: string | null;
  /** The sentence that says what kind of evidence this is. Null for customer work, which says so itself. */
  kindDisclosure: string | null;
  subject: { chainId: number; account: string; blockNumber: string; blockHash: string | null; deployment: string };
}

export type RunOutcome =
  | { ok: true; view: ProofRunView }
  | { ok: false; field: 'scenario' | null; message: string };

export interface RunRequest {
  scenarioId: string;
}

/**
 * The criteria every scenario here is judged against.
 *
 * `pokter-asserted`, and that is not a default to be overridden. A
 * scenario has no agent behind it and therefore no signature, so claiming
 * `signed-terms` would be the exact misrepresentation `bindingFor` exists
 * to prevent.
 */
export function scenarioSpec(): AcceptanceSpec {
  return venusAcceptanceSpec({ deployment: VENUS_COMPTROLLER, chainId: VENUS_CHAIN_ID });
}

/** Said above a fixture's evidence list, so the lines are not read as calls that happened. */
export const FIXTURE_EVIDENCE_NOTE =
  'No node was contacted and no contract was called. The lines below name the calls this check is defined over, and the fixture supplied their answers. They are also the lines sealed into the receipt, so the page and the receipt say the same thing.';

/* ------------------------------------------------------------------ *
 * Composing a view from a run
 * ------------------------------------------------------------------ */

/**
 * The half both cases share.
 *
 * Takes the run the library produced and reads its `provenance` to decide
 * the framing, rather than taking a flag from the caller: a fixture run
 * and a customer run differ in exactly one field that a surface cannot
 * set, and that is the field the drawing should turn on.
 */
function viewOf(input: {
  run: ProofRun;
  spec: AcceptanceSpec;
  scenario: Scenario | null;
  title: string;
  setup: string;
  source: string | null;
  job: JobRef | null;
  atMs: number;
}): ProofRunView {
  const { run, spec, scenario } = input;
  const { subject } = run.sealed.artifact;
  const synthetic = run.result.provenance === 'fixture';
  const remediation = remediationForRun({ ...run.result, detail: run.verification.detail });

  return {
    scenario,
    title: input.title,
    setup: input.setup,
    source: input.source,
    result: run.result,
    reason: run.verification.detail,
    remediation: remediation ? { ...remediation, preamble: REMEDIATION_PREAMBLE[remediation.owner] } : null,
    spec,
    artifactHash: run.sealed.artifactHash,
    artifactHref: input.job ? artifactHref(input.job) : null,
    freshness: { kind: 'fresh', at: new Date(input.atMs).toISOString() },
    method: run.verification.method,
    tolerances: run.verification.tolerance,
    methodNote: synthetic
      ? 'How the check is defined. No call was made in this run: the figures came from the fixture.'
      : null,
    evidenceNote: synthetic ? FIXTURE_EVIDENCE_NOTE : null,
    /*
     * Only a fixture needs its nature said before the figures. Customer
     * work is a real job against real state, and a sentence explaining
     * that it is not synthetic would invite the doubt it answers.
     */
    kindDisclosure: scenario ? KIND_DISCLOSURE[scenario.kind] : null,
    subject: {
      chainId: subject.chainId,
      account: subject.account,
      /* The artifact stores an unknown block as the empty string; a blank
         cell would read as a value nobody noticed was missing. */
      blockNumber: subject.blockNumber || '—',
      blockHash: subject.blockHash,
      deployment: subject.deployment,
    },
  };
}

/** The view for a run against a delivered job, which the job page composes. */
export function jobView(input: {
  run: ProofRun;
  spec: AcceptanceSpec;
  job: JobRef;
  atMs?: number;
}): ProofRunView {
  return viewOf({
    run: input.run,
    spec: input.spec,
    scenario: null,
    title: `Job #${input.job.jobId}`,
    setup: `The report delivered for job #${input.job.jobId} on chain ${input.job.chainId}, checked against Venus’s own figures at the block the report names.`,
    /* The figures came from the chain, so there is no file to cite. */
    source: null,
    job: input.job,
    atMs: input.atMs ?? Date.now(),
  });
}

/* ------------------------------------------------------------------ *
 * Freshness
 * ------------------------------------------------------------------ */

interface CacheEntry {
  view: ProofRunView;
  atMs: number;
}

/**
 * Scenario results this process has already computed, keyed by what would
 * change them.
 *
 * Scenarios only. A job-backed run reads the chain and a delivery, and
 * serving a held copy of one would be reporting state that may have moved
 * — the artifact endpoint recomputes per request for the same reason.
 *
 * The versions are in the key on purpose. A result computed by one
 * verifier and served after the verifier changed is a result about code
 * that is no longer running, and reusing it silently is how a page comes
 * to describe a rule the product has stopped applying.
 *
 * In this process's memory and nowhere else: it does not survive a
 * restart and it is not shared between machines. The view says so in as
 * many words, because "cached" on its own invites a reader to think it
 * means something durable.
 */
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60_000;

function cacheKey(request: RunRequest): string {
  return [request.scenarioId, CRITERIA_VERSION, VERIFIER_VERSION].join('|');
}

/** Drops the one entry this request would reuse, so "Run again" recomputes. */
export function forgetRun(request: RunRequest): void {
  CACHE.delete(cacheKey(request));
}

/* ------------------------------------------------------------------ *
 * Running a scenario
 * ------------------------------------------------------------------ */

export async function runScenario(request: RunRequest, options: { nowMs?: number } = {}): Promise<RunOutcome> {
  const scenario = scenarioById(request.scenarioId);
  if (!scenario) {
    return { ok: false, field: 'scenario', message: 'That scenario is not one ProofRun supports.' };
  }
  /*
   * Only fixtures run from here. `SCENARIOS` ships no replay in this
   * version and the shape is reserved; a replay that did exist would be a
   * particular job's run, which has its own page rather than a button on
   * this one.
   */
  if (scenario.kind !== 'fixture') {
    return {
      ok: false,
      field: 'scenario',
      message:
        'A historical replay is a particular job’s run, not a scenario started from here. It is read on that job’s own page.',
    };
  }

  const now = options.nowMs ?? Date.now();
  const key = cacheKey(request);
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

  const fixture = fixtureFor(scenario.id);
  if (!fixture) {
    /*
     * A scenario the catalogue offers with no position behind it. Said as
     * Pokter's own gap rather than as a result, because a missing fixture
     * is not a finding about anything.
     */
    return {
      ok: false,
      field: 'scenario',
      message: `Pokter holds no position for the “${scenario.label}” scenario, so there is nothing to run. That is a gap in Pokter, not a result.`,
    };
  }

  const spec = scenarioSpec();
  const run = await runFixture(fixture, { spec, checkedAt: new Date(now).toISOString() });

  const view = viewOf({
    run,
    spec,
    scenario,
    title: scenario.label,
    setup: FIXTURE_SETUP[scenario.id] ?? fixture.why,
    source: FIXTURE_SOURCE,
    /* A fixture is not a delivery anyone paid for, so there is no job to
       key a receipt by and no receipt URL to offer. */
    job: null,
    atMs: now,
  });

  CACHE.set(key, { view, atMs: now });
  return { ok: true, view };
}
