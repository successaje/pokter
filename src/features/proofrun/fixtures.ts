import {
  CHECKED_POOL,
  VENUS_CHAIN_ID,
  type VenusEvidence,
  type VenusHealthFacts,
} from '@/lib/delivery/venus-report-check';

/**
 * The four synthetic positions, and the reports an agent might return for
 * them.
 *
 * Every number here was written by hand. None of it has been on BNB Chain,
 * no node was asked for any of it, and nothing in this file touches the
 * network. That is the whole point of a fixture — a position that cannot
 * move while the check is being written — and it is also the one fact the
 * surface must never lose: a synthetic pass drawn as chain history would be
 * a fabricated receipt.
 *
 * Three deliberate choices keep that visible rather than merely documented:
 *
 *  - The accounts begin `0xfacade…` and are otherwise zeros. They are not
 *    wallets. Attaching a written-down position to a real address would
 *    assert something false about whoever holds it.
 *  - The block numbers are far beyond any block BNB Chain has reached, so
 *    a reader who tries to look one up finds nothing rather than finding
 *    somebody else's block and believing it.
 *  - `blockHash` is null. A plausible-looking hash is the most misleading
 *    field available here, because it is the one a reader would take as
 *    checkable. The results view prints the absence.
 */

/** A hand-written position. `0xfacade…`, so it cannot be mistaken for a wallet. */
function syntheticAccount(index: number): string {
  return `0xfacade${'0'.repeat(32)}${String(index).padStart(2, '0')}`;
}

/**
 * A block number no chain has reached, used as a label on a written-down
 * state. Deliberately not a real BNB Chain height: a plausible one invites
 * the reader to look it up and attribute this state to it.
 */
function syntheticBlock(index: number): bigint {
  return BigInt(900_000_000 + index);
}

function facts(input: Omit<VenusHealthFacts, 'chainId' | 'pool' | 'blockHash'>): VenusHealthFacts {
  return { ...input, chainId: VENUS_CHAIN_ID, pool: CHECKED_POOL, blockHash: null };
}

/**
 * The ERC-8183 envelope a delivery arrives in, around a report.
 *
 * `producer` says what wrote it. It is read by `readDeliveredManifest`, and
 * it must not match Pokter's delivery agent, which would class the file as
 * a lifecycle receipt and refuse it before any figure was read.
 */
function manifest(report: Record<string, unknown>): string {
  return JSON.stringify({
    response: { content: JSON.stringify(report) },
    metadata: { producer: 'ProofRun synthetic fixture — written by Pokter, not delivered by an agent' },
  });
}

export interface Fixture {
  id: string;
  account: string;
  block: bigint;
  /** The report under test, as a delivered manifest. */
  manifestText: string;
  /** What Venus would say, or Pokter's inability to ask. */
  evidence: VenusEvidence;
  /** The one line that says what this fixture is for, printed above the run. */
  setup: string;
}

const NORMAL_ACCOUNT = syntheticAccount(1);
const ZERO_DEBT_ACCOUNT = syntheticAccount(2);
const DECIMALS_ACCOUNT = syntheticAccount(3);
const ORACLE_ACCOUNT = syntheticAccount(4);

const FIXTURES: readonly Fixture[] = [
  /*
   * An ordinary position, answered correctly. The base case exists so the
   * other three mean something: a results view that cannot show a pass is
   * not showing failures either, it is broken.
   */
  {
    id: 'fixture:normal-borrowing',
    account: NORMAL_ACCOUNT,
    block: syntheticBlock(1),
    setup:
      'Written-down position: $58,240.77 of collateral against $24,500.12 of debt, health factor 1.6432, not liquidatable. The report under test states 1.643.',
    manifestText: manifest({
      account: NORMAL_ACCOUNT,
      chain_id: VENUS_CHAIN_ID,
      pool: 'core',
      as_of: { block_number: '900000001' },
      health_factor: 1.643,
      liquidatable: false,
      debt_usd: 24500.12,
      collateral_usd: 58240.77,
    }),
    evidence: {
      available: true,
      facts: facts({
        account: NORMAL_ACCOUNT,
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
   * Nothing borrowed, so there is no ratio. Agents answer this with a zero,
   * a one, or a very large number, each of which is a different claim and
   * none of which is "there is no health factor".
   */
  {
    id: 'fixture:zero-debt',
    account: ZERO_DEBT_ACCOUNT,
    block: syntheticBlock(2),
    setup:
      'Written-down position: $12,480.00 of collateral supplied and nothing borrowed. There is no health factor to state, and the report under test says so.',
    manifestText: manifest({
      account: ZERO_DEBT_ACCOUNT,
      chain_id: VENUS_CHAIN_ID,
      pool: 'core',
      as_of: { block_number: '900000002' },
      health_factor: null,
      liquidatable: false,
      debt_usd: 0,
      collateral_usd: 12480,
    }),
    evidence: {
      available: true,
      facts: facts({
        account: ZERO_DEBT_ACCOUNT,
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
    id: 'fixture:mixed-decimals',
    account: DECIMALS_ACCOUNT,
    block: syntheticBlock(3),
    setup:
      'Written-down position: debt of $18,000.00 in an 18-decimal token and $23,118.60 in a 6-decimal one, against $72,903.44 of collateral. The report under test gives the ratio correctly and counts only the 18-decimal leg of the debt.',
    manifestText: manifest({
      account: DECIMALS_ACCOUNT,
      chain_id: VENUS_CHAIN_ID,
      pool: 'core',
      as_of: { block_number: '900000003' },
      health_factor: 1.205,
      liquidatable: false,
      debt_usd: 18000,
      collateral_usd: 72903.44,
    }),
    evidence: {
      available: true,
      facts: facts({
        account: DECIMALS_ACCOUNT,
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
    id: 'fixture:stale-oracle',
    account: ORACLE_ACCOUNT,
    block: syntheticBlock(4),
    setup:
      'Written-down position whose oracle leg does not answer: Venus’s price feed returns nothing for one of the account’s markets, so Pokter has no figures of its own to compare. The report under test states a health factor of 1.0412.',
    manifestText: manifest({
      account: ORACLE_ACCOUNT,
      chain_id: VENUS_CHAIN_ID,
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
] as const;

export function fixtureById(id: string): Fixture | null {
  return FIXTURES.find((fixture) => fixture.id === id) ?? null;
}

export const FIXTURE_IDS: readonly string[] = FIXTURES.map((fixture) => fixture.id);
