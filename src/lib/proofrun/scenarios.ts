import type { VerificationResult } from '@/lib/shared/contracts';

/**
 * The scenarios a buyer can run against an agent, and the one thing the
 * type system is used to prevent.
 *
 * A ProofRun is worth something only if a reader can tell what actually
 * happened. Two things are being shown side by side and they are not the
 * same kind of evidence:
 *
 *   a **replay** re-reads state that genuinely existed on BNB Chain at a
 *   named block, and the agent's answer was produced against it;
 *
 *   a **fixture** is a position somebody wrote down. It never existed on
 *   chain, no provider was contacted, and the figures are constructed to
 *   exercise one behaviour.
 *
 * Both are useful and neither may be dressed as the other. A fixture
 * presented as on-chain history would be a fabricated record, and a
 * fixture run described as having contacted the agent would be a
 * fabricated interaction — the two claims this feature is most able to
 * make by accident and least able to defend.
 *
 * So the distinction is in the type rather than in a label somebody
 * remembers to render: a `fixture` has no block hash to pin and cannot
 * carry one, and a `replay` must name the block it re-reads. Neither
 * shape can be built holding the other's evidence.
 */

interface ScenarioBase {
  id: string;
  /** What a buyer reads on the button. */
  label: string;
  /** What the scenario is for, in one sentence. */
  purpose: string;
  /** Which behaviour it exercises, named so a reader knows what passing proves. */
  exercises: string;
}

/**
 * State that genuinely existed on chain. The block is required, because a
 * replay without one is not a replay — it is a reading of the present
 * wearing a historical label.
 */
export interface ReplayScenario extends ScenarioBase {
  kind: 'replay';
  chainId: number;
  account: string;
  blockNumber: string;
  /** The provenance such a run carries. Narrowed so it cannot be set to `fixture`. */
  provenance: Extract<VerificationResult['provenance'], 'customer' | 'sponsored'>;
}

/**
 * A written-down position. No block, no account on chain, and the type
 * makes that unstateable rather than merely untrue.
 */
export interface FixtureScenario extends ScenarioBase {
  kind: 'fixture';
  provenance: Extract<VerificationResult['provenance'], 'fixture' | 'simulation'>;
}

/*
 * A `fixture: string` field used to sit here, naming `normal-borrow.json`
 * and three siblings. **None of those files existed and nothing read the
 * field** — a dead reference to data that was never written, in the file
 * whose types exist to stop a fixture claiming evidence it does not have,
 * one field away from the test that makes exactly this class executable
 * for routes. It is removed rather than repointed.
 *
 * Repointing it at `tests/fixtures/proofrun/*` would have been worse than
 * leaving it. Eight of those ten carry **real** BNB Chain state — a real
 * account at block 129170001 with that block's real hash — under a
 * written report, and `KIND_DISCLOSURE.fixture` says "it never existed on
 * chain". Printing that over them would make the page assert something
 * untrue about real state and a real wallet. `src/` importing from
 * `tests/` would also ship test data in the bundle.
 *
 * The honest shape is a third kind this union cannot express: real,
 * named, verifiable chain state under a synthetic report. It is not added
 * here because nothing offers it to a buyer yet, and a kind with no
 * instance is the thing `SCENARIOS` is careful not to ship. When a
 * surface needs it, that is the change — not a filename.
 */

export type Scenario = ReplayScenario | FixtureScenario;

/**
 * The supported set for this version.
 *
 * Deliberately small. Each one exists because it exercises a behaviour
 * that has gone wrong, or could, and a scenario that proves nothing in
 * particular would pad the list while making the page harder to read.
 *
 * Every one is a fixture, and no replay ships in this version. The shape
 * exists and is ready, but a replay needs historical state the free BNB
 * endpoints stopped serving about a hundred blocks ago, so one offered
 * here without an archive key would answer "not verified" every time —
 * a scenario whose only reliable outcome is a shrug. Shipping the type
 * without an instance says we cannot do it yet; shipping an instance
 * that never works would say we can.
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'normal-borrow',
    kind: 'fixture',
    label: 'Normal borrowing',
    purpose: 'An ordinary position with collateral and debt, where a correct answer is available and checkable.',
    exercises: 'The health factor, the liquidation flag and both USD totals, all compared against the position as written.',
    provenance: 'fixture',
  },
  {
    id: 'zero-debt',
    kind: 'fixture',
    label: 'No debt',
    purpose: 'A position that has borrowed nothing, so there is no health factor to report.',
    exercises: 'Whether an agent invents a ratio where none exists. Venus has no health factor for an account with no debt, and the right answer says so.',
    provenance: 'fixture',
  },
  {
    id: 'mixed-decimals',
    kind: 'fixture',
    label: 'Mixed token decimals',
    purpose: 'Collateral and debt in tokens of different precision, where a naive calculation is off by orders of magnitude.',
    exercises: 'Decimal handling across markets. This is the error that looks most like a correct answer at a glance.',
    provenance: 'fixture',
  },
  {
    id: 'stale-oracle',
    kind: 'fixture',
    label: 'Stale or missing oracle price',
    purpose: 'A position where one price is stale or absent, so part of the position cannot be valued.',
    exercises: 'Whether an agent reports the gap or fills it. A health factor computed through a missing price is a guess presented as a figure.',
    provenance: 'fixture',
  },
];

/**
 * How each kind must be described wherever it is shown.
 *
 * Kept beside the scenarios rather than in a component, so the UI and any
 * assistant consuming this say the same thing — and so the sentence that
 * stops a fixture being read as history lives next to the data rather
 * than in markup somebody can restyle away.
 */
export const KIND_DISCLOSURE: Readonly<Record<Scenario['kind'], string>> = {
  replay:
    'Historical replay. This state existed on BNB Chain at the block named, and the figures are re-read from it. Whether the agent’s answer was produced at that time is a separate question, answered by the job it came from.',
  fixture:
    'Synthetic fixture. This position was written down to exercise one behaviour — it never existed on chain, and running it contacts no provider. It shows how the checks behave, not what an agent did.',
};

export function scenarioById(id: string): Scenario | null {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

/**
 * The standing limits of what a ProofRun establishes, said wherever a
 * result is.
 *
 * These are not a disclaimer appended to a claim. They are the shape of
 * the claim: a reader who takes all of these on board and still finds the
 * result useful has understood it, and one who skips them has not.
 */
export const PROOFRUN_LIMITATIONS = [
  'A passing run means the named checks agreed with Venus at one block. It is not a statement about the agent’s other answers, its advice, or its future work.',
  'Only factual figures are checked. Whether a position is wise, or what to do about it, is outside what any of this can settle.',
  'Only Venus Core Pool on BNB Smart Chain is supported. A buyer cannot currently ask for a position on another deployment to be checked, and a report about one would not be verified here.',
  'Checks are bound to the block the report names. Where a node no longer serves that block, the result is not verified rather than re-read at the head.',
  'The agent’s own build is established only where the agent publishes one. Otherwise it is reported as unknown rather than assumed.',
  'Pokter has measured these agents and, mostly, nobody else has. Answering a check is not the same as being independently audited.',
] as const;
