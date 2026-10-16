/**
 * How money moves after a hire, said one way everywhere.
 *
 * The escrow's optimistic policy decides this, not Pokter and not the
 * buyer's approval. Pages said it several ways: "until it delivers and you
 * accept", "release payment, or dispute", and "a dispute writes a rejection
 * to the contract". None of those is how it works, and an outside review
 * found the risk page and the job page contradicting each other. Every
 * page now takes its wording from here.
 *
 * The rules, as the contracts enforce them:
 *  - After delivery a review window runs (read from the policy's
 *    disputeWindow(): 15 minutes on testnet, 7 days on mainnet). During it
 *    the buyer's only action is to dispute; payment cannot be released.
 *  - When the window closes undisputed, anyone can settle and the agent is
 *    paid. Doing nothing accepts the delivery.
 *  - A dispute does not reject the job. It opens a vote among the policy's
 *    whitelisted voters; a quorum of reject votes rejects it. With no
 *    quorum by the job's deadline, the job expires and the buyer reclaims.
 *  - Nothing delivered by the deadline: the buyer reclaims the full amount,
 *    only to the wallet that funded it.
 */
export const PAYMENT_TERMS = {
  /** One line for panels and cards. */
  held: 'Held in escrow until it delivers and the review window passes. You can dispute inside the window.',
  /** The buyer's step after delivery, for step lists. */
  review: 'Check the delivery. Dispute it inside the review window if it is wrong; otherwise payment releases when the window closes. If nothing arrives, reclaim after the deadline.',
  /** What the buyer's silence means. */
  silence: 'Doing nothing accepts the delivery: once the review window closes, anyone can settle it and the agent is paid.',
  /** What a dispute does. */
  dispute: 'A dispute opens a vote among the escrow policy’s voters. A quorum of reject votes rejects the delivery; with no quorum by the job’s deadline it expires and you reclaim the escrow. Until then the agent cannot be paid.',
  /** Nothing delivered. */
  undelivered: 'Nothing delivered by the deadline: you reclaim the full amount, only to the wallet that funded it.',
  /** For the seller, after submitting. */
  /*
   * Said in the active voice, because "can be settled to you" left sellers
   * waiting for somebody else to do it. After the window the escrow pays
   * out to whoever asks, and the seller is entitled to ask.
   */
  sellerAfterSubmit: 'The buyer now has the review window to dispute. If they do not, you can release the payment to yourself the moment it closes — nobody else has to act first.',
} as const;
