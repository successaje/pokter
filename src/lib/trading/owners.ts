import { isAddress } from 'viem';

/**
 * The owner's own addresses for a watched trading wallet, and the
 * signature that sets them.
 *
 * Transfers to these addresses read as "sent to an address you listed",
 * not as a loss, so they are an exception to the one rule the watch
 * exists to enforce. Anybody could set them when they were a plain field
 * on the public watch request: list your own address against somebody
 * else's watched wallet, and a drain to it raised no alert. Setting them
 * now takes a signature from the watched wallet itself, over the exact
 * list, so only whoever controls the money can say where it may go.
 */

/** Long enough to sign in a wallet, short enough that a captured signature is soon useless. */
export const OWNERS_SIGNATURE_TTL_MS = 10 * 60_000;
export const MAX_OWNERS = 5;

/** Valid in any capitalisation, lower-cased, without the wallet itself, deduplicated and sorted, so the same list always signs the same text. */
export function normaliseOwners(wallet: string, raw: readonly unknown[]): string[] | null {
  const w = wallet.toLowerCase();
  const list = raw.map(String).map((s) => s.trim());
  // Any capitalisation: a pasted address is lower-cased below anyway, and strict checksums refuse ones typed by hand.
  if (list.some((s) => !isAddress(s, { strict: false }))) return null;
  const owners = [...new Set(list.map((s) => s.toLowerCase()))].filter((o) => o !== w).sort();
  return owners.length > MAX_OWNERS ? null : owners;
}

export function ownersMessage(input: { wallet: string; owners: readonly string[]; issuedAt: string }): string {
  return [
    'Pokter trading watch: set the addresses I own',
    '',
    `Wallet: ${input.wallet.toLowerCase()}`,
    `Owner addresses: ${input.owners.length ? input.owners.join(', ') : 'none'}`,
    `Issued: ${input.issuedAt}`,
    '',
    'Transfers to these addresses will not raise an alert.',
  ].join('\n');
}

/**
 * Milliseconds since the epoch for a signed list's time; null when there is
 * none and null when it cannot be read.
 *
 * Lists are ordered by this number and never by the text, because
 * `issuedAt` arrives from a client and `Date.parse` accepts an offset:
 * `2026-10-21T13:00:00+01:00` is half an hour earlier than
 * `2026-10-21T12:30:00Z` and sorts after it as text.
 */
export function ownersSignedAtMs(at: string | null | undefined): number | null {
  if (!at) return null;
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Whether a list signed at `issuedAtMs` replaces one recorded at
 * `recordedMs`. Nothing recorded, so anything wins; otherwise strictly
 * newer, so a request that arrives twice is a no-op rather than a second
 * write saying the same thing.
 *
 * `recordSignedOwners` applies the same rule inside the `UPDATE` that
 * writes, where it is atomic. This is the readable statement of it, used
 * for the check the route makes before it spends an RPC call verifying a
 * signature, and the two are held to the same cases by
 * `tests/trading-owner-list.test.mts`.
 */
export function ownersUpdateSupersedes(issuedAtMs: number, recordedMs: number | null): boolean {
  return recordedMs === null || issuedAtMs > recordedMs;
}

/**
 * Whether what is recorded is already exactly what this request asks for.
 *
 * A retried request — a double submit, or a client that resent after losing
 * the response — carries the same list and the same signed time as the one
 * already saved. Treated as a stale list it was refused, which is untrue of
 * it twice over: nothing is being replaced, and the state the caller wanted
 * is the state there is. So the route answers it with the list instead of a
 * conflict, once the signature over it has been checked like any other.
 *
 * Times are compared as instants, not as text, because the same moment can
 * be written more than one way; lists element by element, because both
 * sides have been through `normaliseOwners` and so are sorted and lowered.
 */
export function ownersAlreadyRecorded(
  recorded: { owners: readonly string[]; signedAt: string | null } | null,
  asked: { owners: readonly string[]; issuedAt: string },
): boolean {
  if (!recorded || recorded.signedAt === null) return false;
  const at = ownersSignedAtMs(asked.issuedAt);
  if (at === null || at !== ownersSignedAtMs(recorded.signedAt)) return false;
  return recorded.owners.length === asked.owners.length && recorded.owners.every((o, i) => o === asked.owners[i]);
}

/**
 * Whether a signed list may replace the stored one, before the signature
 * itself is checked: recent, not from the future, and newer than the list
 * it replaces, so an old signature cannot be replayed to bring back an
 * address the owner removed.
 *
 * This answers the question for the list that was stored when the request
 * was read, which is not the question that matters by the time it writes.
 * Verifying the signature takes two round trips, another accepted request
 * can finish inside them, and this check cannot see it. Only the guard in
 * `recordSignedOwners` can, so passing here is permission to try the
 * write, not permission to overwrite whatever is there.
 */
export function ownersSignatureProblem(input: { issuedAt: string; now: number; lastSignedAt: string | null }): string | null {
  const at = ownersSignedAtMs(input.issuedAt);
  if (at === null) return 'The signed message has no valid time.';
  if (at > input.now + 60_000) return 'The signed message is dated in the future. Check your device clock.';
  if (input.now - at > OWNERS_SIGNATURE_TTL_MS) return 'That signature has expired. Sign again.';
  if (!ownersUpdateSupersedes(at, ownersSignedAtMs(input.lastSignedAt))) return 'A newer list of owner addresses is already saved.';
  return null;
}
