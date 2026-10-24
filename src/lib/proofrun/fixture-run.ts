import {
  CHECKED_POOL,
  checkDeliveredVenusReport,
  VENUS_CHAIN_ID,
  type VenusEvidence,
  type VenusHealthFacts,
} from '@/lib/delivery/venus-report-check';
import { VENUS_COMPTROLLER } from '@/lib/assay/venus';
import type { AcceptanceSpec } from '@/lib/shared/contracts';
import { venusAcceptanceSpec } from './acceptance';
import { proofRun, type ProofRun } from './run';

/**
 * Running a scenario against a written-down position.
 *
 * The seam this uses is the reason it can be trusted: `readFactsAt` is
 * injected into `checkDeliveredVenusReport` and is only ever called with
 * the block the report names. A fixture supplies the facts directly, so
 * a fixture run **cannot** reach the network — not by convention, but
 * because there is no code path from here to an RPC. That is what makes
 * "this run contacted no provider" a fact about the program rather than
 * a promise in the copy.
 *
 * The same checker judges fixtures and real deliveries. A scenario that
 * exercised a separate comparison would be testing the scenario harness
 * rather than the thing a buyer is about to rely on.
 */

export interface ProofRunFixture {
  id: string;
  /** What this fixture proves, carried in the file so it cannot drift from the data. */
  why: string;
  /** The report, exactly as an agent would have delivered it. */
  report: string;
  account: string;
  /**
   * What Venus "says" for this position, or an honest refusal.
   *
   * A refusal is as much a fixture as a position: the pruned-node and
   * stale-oracle cases are the ones where a verifier is most likely to
   * quietly pass something, and they cannot be exercised with facts.
   */
  evidence: VenusEvidence;
  /**
   * Whether the delivered bytes match what was committed on chain.
   *
   * Defaults to `true`, and the reasoning matters because the obvious
   * alternative is wrong in both directions.
   *
   * For a real delivery this answers "are the bytes Pokter read the ones
   * the agent committed?", and anything but `true` stops the check:
   * `false` means the wrong document, `null` means Pokter could not tell.
   * A fixture has no commitment and no serving step — the fixture *is*
   * the bytes under test — so the question is vacuous rather than
   * unanswered. Passing `null` would refuse every fixture with "Pokter
   * could not confirm", which is true of a chain lookup nobody performed
   * and useless as a scenario.
   *
   * It is not laundering a claim: the artifact carries
   * `provenance: 'fixture'`, the scenario says in words that the position
   * never existed on chain, and neither can be set otherwise by a caller.
   *
   * Overridable, so a fixture can still exercise the mismatch path —
   * which is a case worth having, since a tampered delivery is one of
   * the failures a buyer most needs the checker to catch.
   */
  manifestMatchesChain?: boolean | null;
  /**
   * What this fixture could not establish, carried into the receipt.
   *
   * The labelling has to survive the artifact leaving the repository. A
   * fixture written over real chain state should say which half was
   * real there, not only in the file it came from.
   */
  limitations?: readonly string[];
}

/**
 * Facts for a fixture, with the one field a fixture may never carry.
 *
 * `blockHash` is forced to null. A fixture position never existed on
 * chain, so a block hash would be asserting that it did — the precise
 * claim the scenario types exist to prevent, and it would survive into
 * the artifact where a replay would then try to pin state that was never
 * there. Taking it here rather than trusting each fixture file means a
 * fixture author cannot add one by accident.
 */
export function fixtureFacts(input: Omit<VenusHealthFacts, 'chainId' | 'pool' | 'blockHash'>): VenusHealthFacts {
  return {
    ...input,
    chainId: VENUS_CHAIN_ID,
    pool: CHECKED_POOL,
    blockHash: null,
  };
}

/**
 * Run one fixture through the real checker and seal the result.
 *
 * `provenance: 'fixture'` is not a parameter. A caller cannot ask for a
 * fixture run to be labelled as customer work, which is the mislabelling
 * that would matter most: a synthetic pass counted as evidence an agent
 * did real work for a real buyer.
 */
export async function runFixture(
  fixture: ProofRunFixture,
  options: { spec?: AcceptanceSpec; checkedAt?: string } = {},
): Promise<ProofRun> {
  const spec = options.spec ?? venusAcceptanceSpec({ deployment: VENUS_COMPTROLLER, chainId: VENUS_CHAIN_ID });

  const verification = await checkDeliveredVenusReport({
    subject: { chainId: VENUS_CHAIN_ID, account: fixture.account, pool: CHECKED_POOL },
    manifestText: fixture.report,
    manifestMatchesChain: fixture.manifestMatchesChain ?? true,
    /*
     * Answers for the block the report names and refuses every other,
     * mirroring the real reader rather than being lenient because it is
     * a fixture. A harness that answered any block would let a report
     * naming the wrong one pass here and fail in production, which is
     * the opposite of what a fixture is for.
     */
    readFactsAt: async ({ block }) => {
      if (!fixture.evidence.available) return fixture.evidence;
      return block === fixture.evidence.facts.block
        ? fixture.evidence
        : {
            available: false,
            code: 'read-failed',
            detail: `this fixture holds block ${fixture.evidence.facts.block}, and the report names ${block}.`,
          };
    },
  });

  return proofRun({
    /*
     * No job. A fixture is not a delivery anyone paid for, and giving it
     * a job reference would put a synthetic run where a reader looks for
     * real ones.
     */
    job: null,
    account: fixture.account,
    deployment: VENUS_COMPTROLLER,
    chainId: VENUS_CHAIN_ID,
    verification,
    manifestText: fixture.report,
    /* A fixture has no funded brief; the report is the whole input. */
    brief: null,
    blockHash: null,
    provenance: 'fixture',
    spec,
    checkedAt: options.checkedAt,
    limitations: [
      'This run was made against a written-down position. No provider was contacted and nothing was read from a chain.',
      ...(fixture.limitations ?? []),
    ],
  });
}
