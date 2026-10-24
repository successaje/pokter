/**
 * What ran, by version, so a receipt can be replayed by the same thing.
 *
 * Two versions and not one, because they change for different reasons and
 * a replay has to tell the two apart. The criteria are what was agreed
 * before the job; the verifier is the code that checks them afterwards.
 * A verifier fixed to read a threshold it had been reading wrongly must
 * not look like the buyer agreed to different criteria, and a buyer who
 * asks for a stricter tolerance must not look like a different verifier
 * ran. A receipt carries both and a replay reports a mismatch in either,
 * rather than silently re-checking with whatever is current.
 */

/** The criteria set a spec is built from. Bump when a criterion's meaning changes. */
export const CRITERIA_VERSION = 'venus-health-factor-criteria@1';

/**
 * The checker that computes observed values. Bump on any change to what a
 * check reads, how it compares, or the tolerance it allows.
 */
export const VERIFIER_VERSION = 'venus-health-factor@1';

/** The artifact format itself. Bump when a field's meaning changes, not when one is added. */
export const ARTIFACT_VERSION = 'pokter-proofrun/1' as const;

/**
 * The prefix the agent signs, carrying the spec hash.
 *
 * This is the whole integrity story in one line. The criteria themselves
 * are prose a seller reads, but prose cannot be compared byte for byte
 * later — two readings of "health factor within 0.005" are the same
 * agreement and different strings. The hash can be, so the first signed
 * string is the hash and the rest are the prose it summarises. An agent
 * that signs this has signed the exact criteria set; one that signs only
 * the prose has not, and `bindingFor` says so.
 */
export const SPEC_TERM_PREFIX = `${ARTIFACT_VERSION} spec=`;
