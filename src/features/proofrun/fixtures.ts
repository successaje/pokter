import { fixtureFacts, type ProofRunFixture } from '@/lib/proofrun/fixture-run';
import { SCENARIOS } from '@/lib/proofrun/scenarios';

/**
 * The positions behind the four supported scenarios.
 *
 * Every number here was written by hand. None of it has been on BNB Chain
 * and nothing in this file touches the network — which `runFixture`
 * guarantees structurally rather than by convention: it injects these
 * facts as `readFactsAt`, so there is no code path from a fixture run to
 * an RPC.
 *
 * ## Why this is not loaded from `tests/fixtures/proofrun/`
 *
 * That directory now exists, and the plan was to read it from here. It
 * turned out to be the wrong move for three separate reasons, each of
 * which would have put a false sentence on the page:
 *
 *  1. **The provenance is different.** Eight of those ten fixtures carry
 *     *real* BNB Chain state — a real account, block 129,170,001, and
 *     that block's real hash — with a synthetic report written against
 *     it. Only `04-zero-debt.json` is synthetic throughout. The sentence
 *     this page prints over a fixture is the library's own
 *     `KIND_DISCLOSURE.fixture`: "it never existed on chain". That is
 *     true of the positions below and false of most of those, so loading
 *     them would make the page assert something untrue about real state
 *     and a real wallet.
 *  2. **The names do not line up.** `SCENARIOS` names `normal-borrow.json`,
 *     `zero-debt.json`, `mixed-decimals.json` and `stale-oracle.json`;
 *     the files are `01-correct-report.json` through
 *     `10-changed-verifier-version.json`. Nothing resolves the `fixture`
 *     field, so it currently names four files that do not exist.
 *  3. **The dependency runs the wrong way.** `src/` importing from
 *     `tests/` would ship test data in the application bundle and tie
 *     production code to the test tree. Nothing in `src/` does that, and
 *     those files are not this agent's to reshape.
 *
 * So the positions stay here, where they genuinely are what the page says
 * they are, and `FIXTURE_SOURCE` points a reader at this file rather than
 * at one it is not reading.
 *
 * Three deliberate choices keep the synthetic nature visible rather than
 * merely documented:
 *
 *  - The accounts begin `0xfacade…` and are otherwise zeros. They are not
 *    wallets. Attaching a written-down position to a real address would
 *    assert something false about whoever holds it.
 *  - The block numbers are far beyond any height BNB Chain has reached
 *    (around 129.5 million when this was written), so a reader who tries
 *    to look one up finds nothing rather than finding somebody else's
 *    block and believing it.
 *  - No block hash. `fixtureFacts` forces it to null, and that is the
 *    point: a plausible-looking hash is the most misleading field
 *    available, because it is the one a reader would take as checkable.
 */

/** Said in the UI wherever a fixture is cited, so the page names its real source. */
export const FIXTURE_SOURCE =
  'These positions are written down in src/features/proofrun/fixtures.ts. Nothing in them was read from a chain.';

/** A hand-written position. `0xfacade…`, so it cannot be mistaken for a wallet. */
function syntheticAccount(index: number): string {
  return `0xfacade${'0'.repeat(32)}${String(index).padStart(2, '0')}`;
}

/**
 * A block number no chain has reached, used as a label on a written-down
 * state. Deliberately not a real BNB Chain height: a plausible one invites
 * a reader to look it up and attribute this position to it.
 */
function syntheticBlock(index: number): bigint {
  return BigInt(900_000_000 + index);
}

/**
 * The ERC-8183 envelope a delivery arrives in, around a report.
 *
 * `producer` says what wrote it. It is read by `readDeliveredManifest`,
 * and it must not match Pokter's own delivery agent — that would class the
 * file as a lifecycle receipt and refuse it before any figure was read.
 */
function manifest(report: Record<string, unknown>): string {
  return JSON.stringify({
    response: { content: JSON.stringify(report) },
    metadata: { producer: 'ProofRun synthetic fixture — written by Pokter, not delivered by an agent' },
  });
}

const NORMAL = syntheticAccount(1);
const ZERO_DEBT = syntheticAccount(2);
const DECIMALS = syntheticAccount(3);
const ORACLE = syntheticAccount(4);

/**
 * What each fixture sets up, for the line above the results.
 *
 * Separate from the scenario's `purpose`, which describes the shape in
 * general. This describes these particular figures, so a reader can check
 * the table against the position it was run on.
 */
export const FIXTURE_SETUP: Readonly<Record<string, string>> = {
  'normal-borrow':
    'Written-down position: $58,240.77 of collateral against $24,500.12 of debt, health factor 1.6432, not liquidatable. The report under test states 1.643.',
  'zero-debt':
    'Written-down position: $12,480.00 of collateral supplied and nothing borrowed. There is no health factor to state, and the report under test says so.',
  'mixed-decimals':
    'Written-down position: debt of $18,000.00 in an 18-decimal token and $23,118.60 in a 6-decimal one, against $72,903.44 of collateral. The report under test gives the ratio correctly and counts only the 18-decimal leg of the debt.',
  'stale-oracle':
    'Written-down position whose oracle leg does not answer: Venus’s price feed returns nothing for one of the account’s markets, so Pokter has no figures of its own to compare. The report under test states a health factor of 1.0412.',
};

const FIXTURES: readonly ProofRunFixture[] = [
  /*
   * An ordinary position, answered correctly. The base case exists so the
   * other three mean something: a results view that cannot show a pass is
   * not showing failures either, it is broken.
   */
  {
    id: 'normal-borrow',
    why: 'A correct report on an ordinary position. Every compared check agrees, so this is the run that shows what passing looks like.',
    account: NORMAL,
    report: manifest({
      account: NORMAL,
      chain_id: 56,
      pool: 'core',
      as_of: { block_number: '900000001' },
      health_factor: 1.643,
      liquidatable: false,
      debt_usd: 24500.12,
      collateral_usd: 58240.77,
    }),
    evidence: {
      available: true,
      facts: fixtureFacts({
        account: NORMAL,
        block: syntheticBlock(1),
        blockTime: '2026-10-20T11:04:08.000Z',
        healthFactor: 1.6432,
        borrowLimitRatio: 1.421,
        liquidatable: false,
        debtUsd: 24500.12,
        collateralUsd: 58240.77,
      }),
    },
  },

  /*
   * Nothing borrowed, so there is no ratio. Agents answer this with a
   * zero, a one, or a very large number, each of which is a different
   * claim and none of which is "there is no health factor".
   */
  {
    id: 'zero-debt',
    why: 'A correct report on a position with no debt. It states that there is no ratio rather than inventing one, and the dollar totals are still checked.',
    account: ZERO_DEBT,
    report: manifest({
      account: ZERO_DEBT,
      chain_id: 56,
      pool: 'core',
      as_of: { block_number: '900000002' },
      health_factor: null,
      liquidatable: false,
      debt_usd: 0,
      collateral_usd: 12480,
    }),
    evidence: {
      available: true,
      facts: fixtureFacts({
        account: ZERO_DEBT,
        block: syntheticBlock(2),
        blockTime: '2026-10-20T11:09:41.000Z',
        healthFactor: null,
        borrowLimitRatio: null,
        liquidatable: false,
        debtUsd: 0,
        collateralUsd: 12480,
      }),
    },
  },

  /*
   * The decimals bug, with the ratio intact.
   *
   * Debt sits in an 18-decimal token and a 6-decimal one. An agent that
   * applies one scale to both loses the 6-decimal leg almost entirely, and
   * the health factor can still land inside tolerance because Venus's own
   * liquidity figure carries the weighting — so the ratio looks right and
   * the dollar total is out by $23,118.60. This is the fixture that shows
   * why the USD rows are checked at all.
   */
  {
    id: 'mixed-decimals',
    why: 'A report whose ratio is right and whose debt total is wrong by the size of one token leg. It is the failure that looks most like a pass.',
    account: DECIMALS,
    report: manifest({
      account: DECIMALS,
      chain_id: 56,
      pool: 'core',
      as_of: { block_number: '900000003' },
      health_factor: 1.205,
      liquidatable: false,
      debt_usd: 18000,
      collateral_usd: 72903.44,
    }),
    evidence: {
      available: true,
      facts: fixtureFacts({
        account: DECIMALS,
        block: syntheticBlock(3),
        blockTime: '2026-10-20T11:15:22.000Z',
        healthFactor: 1.2049,
        borrowLimitRatio: 1.0533,
        liquidatable: false,
        debtUsd: 41118.6,
        collateralUsd: 72903.44,
      }),
    },
  },

  /*
   * Pokter cannot see.
   *
   * The report may be perfect; nothing here establishes that either way.
   * The fixture is included because a verifier with no path to "not
   * verified" will report a pass when its own reading fails, and that is
   * the defect this whole feature exists to refuse. The refusal is
   * Pokter's, and the copy says so rather than leaving it to read as a
   * finding against the agent.
   */
  {
    id: 'stale-oracle',
    why: 'A position Pokter cannot price. Every check must come back not verified: the one case where a silent pass would be worst.',
    account: ORACLE,
    report: manifest({
      account: ORACLE,
      chain_id: 56,
      pool: 'core',
      as_of: { block_number: '900000004' },
      health_factor: 1.0412,
      liquidatable: false,
      debt_usd: 31044.9,
      collateral_usd: 33023.12,
    }),
    evidence: {
      available: false,
      code: 'read-failed',
      detail:
        'the Venus oracle returned a zero price for one of this account’s markets, so neither the dollar totals nor the ratio could be computed.',
    },
  },
];

export function fixtureFor(scenarioId: string): ProofRunFixture | null {
  return FIXTURES.find((fixture) => fixture.id === scenarioId) ?? null;
}

/**
 * Every scenario the library publishes has a position behind it.
 *
 * Exported for the test that holds the two together: a scenario offered on
 * the page with no fixture would be a button that always errors, and a
 * fixture with no scenario is dead data nobody can reach.
 */
export const FIXTURE_IDS: readonly string[] = FIXTURES.map((fixture) => fixture.id);
export const FIXTURE_SCENARIO_IDS: readonly string[] = SCENARIOS.filter((s) => s.kind === 'fixture').map((s) => s.id);
