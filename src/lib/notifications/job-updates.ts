import { canSubscribeSilently, identityUsable, type NotificationIdentity } from './identity';

/**
 * Per-job email updates, offered to a buyer who has already proven an
 * address.
 *
 * Before this, every job asked for the address again and sent another
 * confirmation link — four hires, four identical forms, four emails to the
 * same inbox. The proof already exists; what is missing is the buyer saying
 * "this job too".
 *
 * Two things are deliberately not symmetric, and the asymmetry is the whole
 * design:
 *
 * - **Turning updates on is silent.** The address comes from the wallet's
 *   own proven identity on the server, never from the request, so the only
 *   reachable outcome is that a wallet's own inbox hears about that
 *   wallet's own job. Nothing is disclosed to anywhere new.
 * - **Turning updates off needs the wallet to sign.** Silencing a delivery
 *   email can make a buyer miss their review window and let a job settle
 *   unexamined. That is a real loss, so it costs a signature — or the
 *   unsubscribe link in any of the emails, which proves the inbox instead.
 */

/** Whether a wallet has a subscription live for one job right now. */
export interface JobUpdateRow {
  /** The address this job's updates go to, which need not be the identity's. */
  email: string;
  /** Null when the inbox never confirmed. */
  verifiedAt: string | null;
  unsubscribedAt: string | null;
  includeAnswer: boolean;
}

export type JobUpdateOffer =
  /** No proven address: ask for one, as the original form does. */
  | { kind: 'ask-email' }
  /** Proven and confirmed: one click, no typing, no second email. */
  | { kind: 'reuse'; email: string }
  /** Claimed but the inbox has not confirmed yet, so nothing can be sent. */
  | { kind: 'await-inbox'; email: string }
  /** Already on for this job. */
  | { kind: 'on'; email: string; includeAnswer: boolean }
  /** Was on, and stopped. Offer it again rather than pretending it is on. */
  | { kind: 'resume'; email: string };

export function jobUpdateOffer(input: {
  identity: NotificationIdentity | null;
  row: JobUpdateRow | null;
}): JobUpdateOffer {
  const { identity, row } = input;
  const live = row && row.verifiedAt && !row.unsubscribedAt;

  /*
   * A live row wins over the identity's state. The row is what decides
   * whether mail is sent, and a buyer who subscribed by typing an address
   * has working updates whether or not a wallet ever signed for it — so
   * reporting "off" because no identity exists would be false.
   */
  if (live) {
    return { kind: 'on', email: row!.email, includeAnswer: row!.includeAnswer };
  }
  if (!identityUsable(identity)) {
    return identity && identity.provenAt && !identity.removedAt
      ? { kind: 'await-inbox', email: identity.email }
      : { kind: 'ask-email' };
  }
  const email = identity!.email;
  return row?.unsubscribedAt ? { kind: 'resume', email } : { kind: 'reuse', email };
}

/**
 * Whether a new row may be recorded as already-confirmed.
 *
 * The confirmation link exists to prove an inbox is real and willing. A
 * ready identity has already produced exactly that proof for this address,
 * so asking for it again proves nothing and trains buyers to click links.
 *
 * It is true only when the address is the identity's own. If a caller ever
 * passes a typed address, this must return false: pre-verifying it would
 * let anyone send Pokter mail to an inbox that never agreed to receive it.
 */
export function subscriptionPreVerified(identity: NotificationIdentity | null, email: string): boolean {
  if (!canSubscribeSilently(identity)) return false;
  return identity!.email.trim().toLowerCase() === email.trim().toLowerCase();
}

/**
 * Whether stopping these updates has to be signed for.
 *
 * Yes, unless the request arrived with the inbox's own unsubscribe token.
 * Knowing a wallet address is public; being able to mute a buyer's delivery
 * email should not follow from it.
 */
export function stopNeedsWalletProof(via: 'app' | 'email-link'): boolean {
  return via !== 'email-link';
}

/** What the toggle says, so the copy is tested rather than retyped per surface. */
export function jobUpdateLabel(offer: JobUpdateOffer): string {
  switch (offer.kind) {
    case 'on': return 'Updates are on for this job';
    case 'reuse': return 'Get updates for this job';
    case 'resume': return 'Get updates for this job again';
    case 'await-inbox': return 'Confirm your email to get updates';
    case 'ask-email': return 'Email me when it is delivered';
  }
}
