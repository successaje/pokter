import type { Address } from 'viem';

/**
 * A notification email a wallet has proven it controls, and what that does
 * and does not permit.
 *
 * Buyer subscriptions are keyed `(email, chain, job)` and carry a wallet
 * address that nobody checked — whoever typed the form supplied it. That is
 * enough to send updates about one job to one inbox, and not enough to let
 * an address stand for a person: an email verification proves control of
 * the inbox, never of the wallet.
 *
 * So the reusable association is proven separately, with the same
 * signed-challenge shape publishers already use to claim an agent
 * (`builders/verification.ts`): a nonce, an issue time, an expiry, and a
 * single use. The wallet signs; the inbox is then verified by link; only
 * when both have happened is the identity usable.
 *
 * Two rules live here because getting either wrong widens somebody's
 * consent without them doing anything:
 *
 * 1. **An identity is not a subscription.** Proving an email belongs to a
 *    wallet says where updates may be sent, not that the buyer wants them
 *    for every job they ever fund. Each job is opted into on its own.
 * 2. **Existing rows are never promoted.** A pre-existing per-job
 *    subscription proves an inbox and an unverified address. Treating it as
 *    a proven identity would turn a weaker claim into a stronger one with
 *    no new evidence, so the old rows keep working and claim nothing.
 */

export const IDENTITY_CHALLENGE_TTL_MS = 10 * 60_000;

/**
 * How widely one proof reaches.
 *
 * Scoped per chain, always. The same address on 56 and 97 is one key for an
 * EOA, but for a smart-contract account it is two contracts that need not
 * share an owner — so a proof on testnet must not speak for mainnet. The
 * cost is one extra signature for an EOA holder; the alternative is a
 * mainnet inbox bound by a testnet signature.
 */
export type IdentityScope = { chainId: number };

export function identityKey(wallet: string, scope: IdentityScope): string {
  return `${wallet.toLowerCase()}:${scope.chainId}`;
}

/**
 * What a signature is being asked to authorise.
 *
 * The purpose is in the signed text and checked when the challenge is
 * redeemed, because a wallet that signed "send my updates here" has not
 * agreed to "stop sending them". Without this, one challenge would redeem
 * for either act — both need the same key, so it is not an escalation, but
 * the buyer would be signing words that describe the opposite of what
 * happens.
 */
export type IdentityPurpose =
  | { kind: 'claim'; email: string }
  | { kind: 'stop-email' }
  | { kind: 'stop-job'; jobId: string };

export type IdentityPurposeKind = IdentityPurpose['kind'];

function purposeLines(purpose: IdentityPurpose): string[] {
  switch (purpose.kind) {
    case 'claim':
      return [
        'Purpose: Allow Pokter to send this wallet\u2019s job updates to one email address',
        `Email: ${purpose.email}`,
      ];
    case 'stop-email':
      return [
        'Purpose: Remove the email address this wallet uses for job updates',
        'Email: (the address currently on file)',
      ];
    case 'stop-job':
      return [
        `Purpose: Stop email updates for job #${purpose.jobId}`,
        `Job: #${purpose.jobId}`,
      ];
  }
}

function purposeClosing(purpose: IdentityPurpose): string[] {
  const common = 'This signature does not authorize transactions or give Pokter access to funds.';
  if (purpose.kind === 'claim') {
    return [common, 'It does not subscribe you to anything: each job is opted into separately.'];
  }
  if (purpose.kind === 'stop-job') {
    return [common, 'The job page keeps showing the delivery and the review deadline.'];
  }
  return [common, 'Updates already running for individual jobs are stopped with it.'];
}

export function notificationIdentityMessage(input: {
  challengeId: string;
  nonce: string;
  chainId: number;
  wallet: Address;
  /** What the signer is agreeing to, spelled out rather than implied. */
  purpose: IdentityPurpose;
  issuedAt: string;
  expiresAt: string;
}): string {
  return [
    'Pokter notification email verification',
    ...purposeLines(input.purpose),
    `Wallet: ${input.wallet}`,
    `Network: ${input.chainId}`,
    `Challenge: ${input.challengeId}`,
    `Nonce: ${input.nonce}`,
    `Issued at: ${input.issuedAt}`,
    `Expires at: ${input.expiresAt}`,
    '',
    ...purposeClosing(input.purpose),
  ].join('\n');
}

export type IdentityState = 'none' | 'pending-signature' | 'pending-email' | 'ready' | 'replacing';

export interface NotificationIdentity {
  wallet: string;
  chainId: number;
  email: string;
  /** When the wallet signed for this address. */
  provenAt: string | null;
  /** When the inbox confirmed the link. */
  verifiedAt: string | null;
  removedAt: string | null;
  /**
   * The confirmed address this one is replacing, while the replacement is
   * still unconfirmed. Null once it confirms, and null when nothing is
   * being replaced.
   */
  previousEmail?: string | null;
}

/**
 * What the buyer is looking at, from the row alone.
 *
 * `ready` requires both halves: a wallet signature and a confirmed inbox.
 * Showing "Enabled" after only one of them is how somebody ends up
 * believing they will be told about a delivery that they will not.
 */
export function identityState(row: NotificationIdentity | null): IdentityState {
  if (!row || row.removedAt) return 'none';
  if (!row.provenAt) return 'pending-signature';
  /*
   * A change in flight is its own state, not just "unconfirmed". The jobs
   * already running keep sending to the address on file, so telling the
   * buyer their email is merely pending would understate what is still
   * happening in their inbox.
   */
  if (!row.verifiedAt) return row.previousEmail ? 'replacing' : 'pending-email';
  return 'ready';
}

/** Whether updates may actually be sent to this identity right now. */
export function identityUsable(row: NotificationIdentity | null): boolean {
  return identityState(row) === 'ready';
}

/**
 * Whether a per-job subscription may be created without typing an address.
 *
 * The identity supplies the address; the buyer still has to ask for this
 * job. A caller that treats a ready identity as consent for every job has
 * subscribed somebody to work they have not funded yet.
 */
export function canSubscribeSilently(row: NotificationIdentity | null): boolean {
  return identityUsable(row);
}

/**
 * The address mail is actually going to right now.
 *
 * During a change that is the old, confirmed address — not the new one.
 * The new one has proven nothing yet, and the jobs already running are
 * still sending to the address on file. Anything that reads, stops or
 * lists live subscriptions has to use this, or it will miss them and tell
 * the buyer nothing is sending while their inbox fills up.
 */
export function sendingAddress(row: NotificationIdentity | null): string | null {
  if (!row || row.removedAt) return null;
  return row.previousEmail ?? row.email;
}

/**
 * Masked for display, because the full address belongs in the inbox and
 * nowhere a screenshot can carry it.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '•••';
  const name = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = name.slice(0, 1);
  const tail = name.length > 2 ? name.slice(-1) : '';
  return `${head}${'•'.repeat(Math.max(1, Math.min(6, name.length - head.length - tail.length)))}${tail}@${domain}`;
}
