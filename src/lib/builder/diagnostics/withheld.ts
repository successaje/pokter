/**
 * What is stored and shown in place of a reason the sanitiser would not pass.
 *
 * `sanitiseFailureReason` returns null when a value cannot be bounded — a
 * multi-line message naming a secret, a PEM block — and null on its own is
 * indistinguishable from "the seller gave no reason". Those are different
 * facts: one is Pokter declining to repeat something, the other is the
 * agent saying nothing. A builder chasing the second when it was the first
 * goes looking for a bug in their own error handling.
 *
 * Shared by the recorder and by the delivery classifier so the two cannot
 * drift, and kept in its own module because the recorder is server-only and
 * the classifier is not.
 */
export const WITHHELD_REASON_TEXT = '[withheld: could not be bounded]';
