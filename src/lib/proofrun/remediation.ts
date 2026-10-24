import type { CheckResult, VerificationResult } from '@/lib/shared/contracts';

/**
 * What would make an unverifiable delivery checkable, and whose job it is.
 *
 * ProofRun's position is "see where it fails", and a dead end that says
 * only "could not verify" fails that on its own terms — it tells a buyer
 * nothing to act on and a builder nothing to fix. Mainnet job 56/57071 is
 * the live case: a delivered report from an agent that answers every
 * probe, refused because it never says which block it read. Nothing is
 * wrong with the figures. There is simply no way to check them, and the
 * fix is one field.
 *
 * The distinction this module exists for is **whose** fix it is. Telling a
 * builder to correct something that is not their fault is worse than
 * saying nothing: Pokter's node pruning the block is Pokter's limitation,
 * and a builder who "fixes" it by guessing a block would make a
 * verifiable report into a wrong one.
 *
 * Nothing here implies a report is incorrect. `not-verified` means nobody
 * could check, and every sentence below is about making a check possible —
 * never about the figures being wrong.
 */

export type RemediationOwner = 'builder' | 'pokter' | 'buyer' | 'nobody';

export interface Remediation {
  owner: RemediationOwner;
  /** One sentence, addressed to whoever can act. */
  fix: string;
}

/**
 * Matched on the checker's own sentences, which is fragile, so it is
 * guarded by a test that holds the checker to the phrasings below. The
 * alternative — a reason code threaded through the checker — would be
 * better, and would mean editing a file two other agents read mid-flight.
 * This stays here and can move once the branches are merged.
 */
const PATTERNS: ReadonlyArray<{ when: RegExp; owner: RemediationOwner; fix: string }> = [
  {
    when: /does not say which block it read/i,
    owner: 'builder',
    fix: 'Publish the block number the figures were read at. One field makes the whole report checkable; without it nothing can be compared, because a position moves and a later reading would describe the delay rather than the report.',
  },
  {
    when: /stated to \d+ decimal place/i,
    owner: 'builder',
    fix: 'State the health factor to at least two decimal places. Rounded more coarsely than that, a correct figure and a wrong one cannot be told apart, so the report cannot earn a match.',
  },
  {
    when: /could not resolve the chain|does not say which chain/i,
    owner: 'builder',
    fix: 'Name the chain by its id — 56 for BNB Smart Chain. A chain named in prose that Pokter cannot resolve is not treated as the expected one, because a report must not pick the chain it is judged against.',
  },
  {
    when: /no longer keeps that block|archive|missing trie node|historical state/i,
    owner: 'pokter',
    fix: 'Nothing for the builder to change. Pokter’s node no longer serves state at that block, so the figures cannot be recomputed. A ProofRun run closer to delivery would have checked them.',
  },
  {
    when: /names no wallet address/i,
    owner: 'buyer',
    fix: 'Name the account in the brief. Pokter takes the subject from what was funded and never from the report, so a brief without an address leaves nothing to check against.',
  },
  {
    when: /names more than one address/i,
    owner: 'buyer',
    fix: 'Name one account in the brief. Pokter will not choose between two on the buyer’s behalf, because picking would be deciding the subject for them.',
  },
  {
    when: /could not retrieve the delivered file|could not be read from the link/i,
    owner: 'pokter',
    fix: 'Nothing for the builder to change unless the published link has since gone. Pokter could not fetch the delivered file just now, which is a gap in what Pokter can see rather than a finding about the report.',
  },
];

/** The fix for one unverifiable check, or null when there is nothing useful to say. */
export function remediationFor(check: Pick<CheckResult, 'outcome' | 'limitation'>): Remediation | null {
  /*
   * Only for checks nobody could run. A failed check already has its
   * answer — the figures disagree — and offering a "fix" for it would
   * read as advice on how to make a wrong report pass.
   */
  if (check.outcome !== 'not-verified') return null;
  const text = check.limitation ?? '';
  const match = PATTERNS.find((pattern) => pattern.when.test(text));
  return match ? { owner: match.owner, fix: match.fix } : null;
}

/**
 * The fix for a whole run, when the run was stopped by one thing.
 *
 * Reads the headline and detail as well as the checks, because the
 * commonest dead end — no block named — stops the checker before it
 * produces any check at all.
 */
export function remediationForRun(result: Pick<VerificationResult, 'state' | 'checks' | 'headline'> & { detail?: string }): Remediation | null {
  if (result.state === 'verified' || result.state === 'mismatch') return null;
  const fromChecks = result.checks.map(remediationFor).find((r): r is Remediation => r !== null);
  if (fromChecks) return fromChecks;
  const text = `${result.headline} ${result.detail ?? ''}`;
  const match = PATTERNS.find((pattern) => pattern.when.test(text));
  return match ? { owner: match.owner, fix: match.fix } : null;
}

/** How to introduce the fix, so a builder is not told they got something wrong. */
export const REMEDIATION_PREAMBLE: Readonly<Record<RemediationOwner, string>> = {
  builder: 'This report could not be checked. That is not a finding that it is wrong — it is that nothing here can be compared. What would make it checkable:',
  pokter: 'This report could not be checked, and the reason is on Pokter’s side:',
  buyer: 'This report could not be checked, because of what the brief asked for:',
  nobody: 'This report could not be checked, and there is nothing to change that would alter it:',
};
