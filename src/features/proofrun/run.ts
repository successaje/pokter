import { VENUS_CHAIN_ID } from '@/lib/delivery/venus-report-check';
import { VENUS_COMPTROLLER } from '@/lib/assay/venus';
import { venusAcceptanceSpec } from '@/lib/proofrun/acceptance';
import { runFixture } from '@/lib/proofrun/fixture-run';
import { scenarioById, type Scenario } from '@/lib/proofrun/scenarios';
import { CRITERIA_VERSION, VERIFIER_VERSION } from '@/lib/proofrun/versions';
import type { AcceptanceSpec, VerificationResult } from '@/lib/shared/contracts';

import { FIXTURE_SETUP, FIXTURE_SOURCE, fixtureFor } from './fixtures';

/**
 * What the page needs on top of a run, and nothing the library already
 * decides.
 *
 * `runFixture` does the work: it drives the real checker with the
 * fixture's facts injected as `readFactsAt`, so a fixture run cannot reach
 * the network, and `proofRun` turns the verdict into checks, a state, a
 * headline and a sealed receipt. None of that is repeated here, and the
 * checker is deliberately not run a second time to recover anything —
 * two runs of the same comparison that could disagree is the hazard the
 * single-verifier split exists to remove.
 *
 * What this adds is presentation with nowhere else to live: which scenario
 * ran, what it set up, where those figures are written down, whether the
 * answer was computed now or held, and the framing a fixture's evidence
 * lines need before a reader meets them.
 *
 * The evidence lines themselves pass through untouched. They name contract
 * calls at a block, which under a fixture describes calls nobody made —
 * but they are also the lines sealed into the artifact, and a page showing
 * different ones from the receipt it links to would be two accounts of one
 * run. So the list stays faithful and the framing sits above it.
 *
 * **Known gap.** `ProofRun` carries the result and the sealed artifact,
 * not the `VenusReportVerification` behind them, so the checker's own
 * `detail`, `method` and `tolerance` prose cannot reach this page. The
 * first of those is the sentence that says *what* went wrong — that the
 * oracle returned no price, that the node no longer keeps the block — and
 * the per-check limitations are generic where it is specific. Raised with
 * the library's owner rather than worked around here.
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
  scenario: Scenario;
  /** The particular figures this run was against, above the table. */
  setup: string;
  /** Where those figures are written down, so the page never cites a file it is not reading. */
  source: string;
  result: VerificationResult;
  spec: AcceptanceSpec;
  /** keccak of the sealed receipt. Consistency of these bytes, not correctness. */
  artifactHash: string;
  freshness: Freshness;
  /** Set when the evidence lines name calls this run did not make. */
  evidenceNote: string | null;
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
 * to prevent. `venusAcceptanceSpec` already returns it; it is named here
 * because a surface choosing its own binding is the defect this feature
 * was written to stop.
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
 * The versions are in the key on purpose. A result computed by one
 * verifier and served after the verifier changed is a result about code
 * that is no longer running, and reusing it silently is how a page comes
 * to describe a rule the product has stopped applying.
 *
 * In this process's memory and nowhere else: it does not survive a restart
 * and it is not shared between machines. The view says so in as many
 * words, because "cached" on its own invites a reader to think it means
 * something durable.
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
 * The run
 * ------------------------------------------------------------------ */

/** Said above a fixture's evidence list, so the lines are not read as calls that happened. */
export const FIXTURE_EVIDENCE_NOTE =
  'No node was contacted and no contract was called. The lines below name the calls this check is defined over, and the fixture supplied their answers. They are also the lines sealed into the receipt, so the page and the receipt say the same thing.';

export async function runScenario(request: RunRequest, options: { nowMs?: number } = {}): Promise<RunOutcome> {
  const scenario = scenarioById(request.scenarioId);
  if (!scenario) {
    return { ok: false, field: 'scenario', message: 'That scenario is not one ProofRun supports.' };
  }
  /*
   * Only fixtures run from here. `SCENARIOS` ships no replay in this
   * version and the shape is reserved; a replay that did exist would be a
   * particular job's run, which has its own page and its own artifact
   * endpoint rather than a button on this one.
   */
  if (scenario.kind !== 'fixture') {
    return {
      ok: false,
      field: 'scenario',
      message:
        'A historical replay is a particular job’s run, not a scenario started from here. It is read at that job’s own receipt.',
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
  const checkedAt = new Date(now).toISOString();
  const run = await runFixture(fixture, { spec, checkedAt });
  const { subject } = run.sealed.artifact;

  const view: ProofRunView = {
    scenario,
    setup: FIXTURE_SETUP[scenario.id] ?? fixture.why,
    source: FIXTURE_SOURCE,
    result: run.result,
    spec,
    artifactHash: run.sealed.artifactHash,
    freshness: { kind: 'fresh', at: checkedAt },
    evidenceNote: FIXTURE_EVIDENCE_NOTE,
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

  CACHE.set(key, { view, atMs: now });
  return { ok: true, view };
}
