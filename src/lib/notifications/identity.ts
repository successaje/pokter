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

export function notificationIdentityMessage(input: {
  challengeId: string;
  nonce: string;
  chainId: number;
  wallet: Address;
  /** The address being claimed, shown so the signer can read what they are agreeing to. */
  email: string;
  issuedAt: string;
  expiresAt: string;
}): string {
  return [
    'Pokter notification email verification',
    'Purpose: Allow Pokter to send this wallet’s job updates to one email address',
    `Wallet: ${input.wallet}`,
    `Network: ${input.chainId}`,
    `Email: ${input.email}`,
    `Challenge: ${input.challengeId}`,
    `Nonce: ${input.nonce}`,
    `Issued at: ${input.issuedAt}`,
    `Expires at: ${input.expiresAt}`,
    '',
    'This signature does not authorize transactions or give Pokter access to funds.',
    'It does not subscribe you to anything: each job is opted into separately.',
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
}

/**
 * What the buyer is looking at, from the row alone.
 *
 * `ready` requires both halves: a wallet signature and a confirmed inbox.
 * Showing "Enabled" after only one of them is how somebody ends up
 * believing they will be told about a delivery that they will not.
 */
export function identityState(row: NotificationIdentity | null, replacement?: NotificationIdentity | null): IdentityState {
  if (replacement && !replacement.verifiedAt && row?.verifiedAt) return 'replacing';
  if (!row || row.removedAt) return 'none';
  if (!row.provenAt) return 'pending-signature';
  if (!row.verifiedAt) return 'pending-email';
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
