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
 * Whether a signed list may replace the stored one, before the signature
 * itself is checked: recent, not from the future, and newer than the list
 * it replaces, so an old signature cannot be replayed to bring back an
 * address the owner removed.
 */
export function ownersSignatureProblem(input: { issuedAt: string; now: number; lastSignedAt: string | null }): string | null {
  const at = Date.parse(input.issuedAt);
  if (!Number.isFinite(at)) return 'The signed message has no valid time.';
  if (at > input.now + 60_000) return 'The signed message is dated in the future. Check your device clock.';
  if (input.now - at > OWNERS_SIGNATURE_TTL_MS) return 'That signature has expired. Sign again.';
  if (input.lastSignedAt && at <= Date.parse(input.lastSignedAt)) return 'A newer list of owner addresses is already saved.';
  return null;
}
