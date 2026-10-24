/**
 * The scenarios a ProofRun supports, and the one thing the catalogue exists
 * to keep straight: where each scenario's state came from.
 *
 * Pure and free of lib imports, so the picker in the browser and the runner
 * on the server read the same list. The runner holds the fixture data
 * (`fixtures.ts`); this holds only what a buyer is told, because the label
 * is the part that can lie.
 *
 * Three kinds, and they are never drawn the same:
 *
 *  - `fixture`  A position Pokter wrote down. It has never existed on BNB
 *               Chain, no node was contacted to produce it, and the block
 *               number in it is a label on a made-up state rather than a
 *               block anybody can look up. Saying otherwise would be the
 *               worst thing this surface could do: a synthetic pass
 *               presented as chain history is a fabricated receipt.
 *  - `replay`   Venus's own figures, read at the block the report under
 *               test names. Real state, real block, and it needs a node
 *               that still serves that block — so it fails honestly
 *               rather than falling back to the head.
 *  - `live`     A job the buyer funds, at the head. Optional, priced by the
 *               agent rather than by Pokter, and never started from here.
 */

export type ScenarioKind = 'fixture' | 'replay' | 'live';

export interface ScenarioMeta {
  id: string;
  kind: ScenarioKind;
  label: string;
  /** What this scenario is for, in a buyer's terms. */
  purpose: string;
  /** The failure it is chosen to expose. */
  exposes: string;
}

/**
 * The four supported fixtures.
 *
 * Each one is here because it is a shape agents get wrong, not because it
 * is convenient to render: a plain borrow, the no-debt case that has no
 * ratio to report at all, a position whose legs carry different token
 * decimals, and a reading Pokter cannot take. The last is included
 * deliberately — a check that has no way to end in "not verified" is a
 * check that will report a pass when it cannot see.
 */
export const FIXTURE_SCENARIOS: readonly ScenarioMeta[] = [
  {
    id: 'fixture:normal-borrowing',
    kind: 'fixture',
    label: 'Normal borrowing',
    purpose: 'An ordinary Core Pool position, borrowing well inside its limit.',
    exposes: 'The base case. An agent that cannot answer this one answers none of the others.',
  },
  {
    id: 'fixture:zero-debt',
    kind: 'fixture',
    label: 'Zero debt',
    purpose: 'Collateral supplied and nothing borrowed, so there is no health factor to state.',
    exposes:
      'Agents that return a number anyway — a zero, a one, or a very large figure — rather than saying there is no ratio.',
  },
  {
    id: 'fixture:mixed-decimals',
    kind: 'fixture',
    label: 'Mixed token decimals',
    purpose: 'Debt in both an 18-decimal and a 6-decimal token, collateral in an 18-decimal one.',
    exposes:
      'One scale applied to every leg. The ratio can still come out right while the dollar totals are wrong by a factor of a million.',
  },
  {
    id: 'fixture:stale-oracle',
    kind: 'fixture',
    label: 'Stale or missing oracle data',
    purpose: 'A position Pokter cannot price, because the oracle leg of the reading does not answer.',
    exposes:
      'A verifier that treats its own blindness as agreement. This one must end in “not verified”, never in a pass.',
  },
] as const;

export const REPLAY_SCENARIO: ScenarioMeta = {
  id: 'replay:venus-core',
  kind: 'replay',
  label: 'Historical on-chain replay',
  purpose:
    'Venus’s own figures for an account you name, at the block the report itself names, read from BNB Chain.',
  exposes:
    'Whether the agent’s report still holds against the chain it claimed to read. Needs a node that keeps that block.',
};

export const LIVE_SCENARIO: ScenarioMeta = {
  id: 'live:venus-core',
  kind: 'live',
  label: 'Custom test on a live position',
  purpose: 'A funded job: the agent reports on an account you choose, and ProofRun checks what it delivers.',
  exposes: 'What the agent does for a paying customer, which is the only test it has an incentive to pass.',
};

export const ALL_SCENARIOS: readonly ScenarioMeta[] = [
  ...FIXTURE_SCENARIOS,
  REPLAY_SCENARIO,
  LIVE_SCENARIO,
];

export function scenarioById(id: string): ScenarioMeta | null {
  return ALL_SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

/** The runnable ids, which is everything but the live test. */
export function isRunnable(id: string): boolean {
  const scenario = scenarioById(id);
  return scenario !== null && scenario.kind !== 'live';
}

/**
 * What each kind is, said once and printed wherever the kind is shown.
 *
 * Held here rather than written into each component so the fixture caption
 * cannot drift into implying chain history in one place and not another.
 */
export const KIND_COPY: Record<ScenarioKind, { name: string; blurb: string; provenance: string }> = {
  fixture: {
    name: 'Synthetic fixture',
    blurb:
      'A position Pokter wrote down to exercise one failure. It has never existed on BNB Chain, and no node was contacted to produce it.',
    provenance: 'Synthetic. Not chain history, and not a reading of any live provider.',
  },
  replay: {
    name: 'Historical on-chain replay',
    blurb:
      'Venus’s own figures at a past block, read from BNB Chain. Where the node no longer serves that block, the checks are not verified rather than re-read at the head.',
    provenance: 'Read from BNB Chain at the named block.',
  },
  live: {
    name: 'Live, funded test',
    blurb:
      'A real job at the current head, priced and signed by the agent, funded by you in your own wallet.',
    provenance: 'A funded job against the live provider.',
  },
};

/**
 * The three outcomes, with the words the UI is allowed to use for them.
 *
 * `not-verified` is one outcome and not a family of near-passes: whichever
 * of unsupported, missing or unavailable produced it travels in the check's
 * own `limitation`, so this stays a vocabulary of three.
 */
export const OUTCOME_COPY = {
  passed: { label: 'Passed', meaning: 'The comparison ran and the report matched.' },
  failed: { label: 'Failed', meaning: 'The comparison ran and the report contradicted it.' },
  'not-verified': {
    label: 'Not verified',
    meaning: 'Unsupported, missing or unavailable. Not a pass, and not a finding against the agent.',
  },
} as const;

/** What a ProofRun result is not, printed wherever one is shown. */
export const PROOFRUN_DOES_NOT_MEAN = [
  'There is no overall score and no badge. Each check stands on its own, and a run with one failure is not an average of the rest.',
  'It says nothing about whether a position is safe to hold, and nothing about whether to invest. Pokter does not give investment advice.',
  'It does not check advice, forecasts, prose, or any figure not named in the criteria.',
  'It decides nothing about the money. Pokter does not release, refund or dispute escrow on the strength of a run.',
] as const;
