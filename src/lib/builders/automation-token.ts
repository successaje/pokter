/**
 * A credential a provider's own assistant can hold.
 *
 * The only provider auth Pokter had was `pokter_builder_session`: an
 * httpOnly cookie, set by a wallet signature in a browser. A headless
 * assistant cannot hold it, and the obvious workaround — read the cookie
 * out of the browser and paste it into a chat — is the one thing that must
 * not happen. A session cookie carries every permission the builder has,
 * for a week, with no way to name what it may do and no way to take one
 * back short of expiry.
 *
 * So this is a second credential, deliberately weaker than the session it
 * is minted from:
 *
 *  - **Scoped.** It carries the named scopes below and nothing else. A tool
 *    that needs a scope the token does not hold is refused by name, so the
 *    assistant can say what it is missing rather than guess.
 *  - **Expiring.** At most {@link MAX_TOKEN_DAYS} days, and the expiry is
 *    checked in SQL on every call rather than at mint time.
 *  - **Revocable.** Revocation is a column on the row the call reads, so it
 *    takes effect on the next call with no cache to wait out.
 *  - **Hashed.** Only `sha256(token)` is stored, like the builder session
 *    and for the same reason: a copy of the database is not a set of live
 *    credentials.
 *  - **Unable to spend.** See {@link scopeIsForbidden}. There is no scope
 *    for signing a transaction or moving money, and there cannot be one,
 *    because Pokter holds no key that could use it.
 *
 * Nothing here touches `node:crypto`, deliberately. The setup page is a
 * client component and needs the scope list, the lifetime choices and the
 * wording of a token's state, and importing those used to drag
 * `node:crypto` into the browser bundle — which the webpack build refuses,
 * loudly, and which would have been a broken page rather than a warning.
 * Minting and hashing live in `automation-secret.ts`, which only the server
 * imports.
 */

/** The prefix every automation token carries: Pokter automation. */
export const TOKEN_PREFIX = 'pka_';

/**
 * What an automation token may be allowed to do.
 *
 * Granular on purpose. A provider who wants an assistant that only watches
 * for work it could bid on grants `requests:read` and nothing else, and
 * that token cannot read their jobs, their earnings or stage a deliverable.
 *
 * That claim held for every tool except `provider_status`, which carries no
 * scope — see `assistant/provider-tools.ts` — and which was returning outstanding
 * job ids with the hashes staged against them, quoted proposal prices and a
 * count of indexed jobs to a token holding none of the scopes above. Each
 * of those blocks is now gated on the scope whose wording claims it, so the
 * sentence above, the page that renders these descriptions, and the route
 * all say the same thing.
 */
export const AUTOMATION_SCOPES = [
  {
    id: 'requests:read',
    label: 'Read posted requests',
    what: 'List the open requests on Pokter and what would block a proposal for one.',
  },
  {
    id: 'proposals:write',
    label: 'Prepare and submit proposals',
    what: 'Prepare an unsigned proposal, and submit one the owner has signed. It cannot sign.',
  },
  {
    id: 'jobs:read',
    label: 'Read funded jobs',
    what: 'List the funded jobs waiting on work for this wallet’s agents, with their deadlines.',
  },
  {
    id: 'deliverables:prepare',
    label: 'Stage deliverables',
    what: 'Write the finished work down against a funded job, for the provider wallet to sign and submit.',
  },
  {
    id: 'earnings:read',
    label: 'Read settlement and earnings',
    what: 'Read what settled, what is still in escrow, and what was refunded or disputed.',
  },
] as const satisfies ReadonlyArray<{ id: string; label: string; what: string }>;

export type AutomationScope = (typeof AUTOMATION_SCOPES)[number]['id'];

const SCOPE_IDS: ReadonlySet<string> = new Set(AUTOMATION_SCOPES.map((s) => s.id));

/**
 * What no automation token may ever carry.
 *
 * The delivery flow needs a signature from the provider wallet and an
 * on-chain transaction sent from it. Pokter does not hold that key and will
 * not start, so an automation token cannot be granted the authority to use
 * one — there is nothing on the server for such a scope to reach.
 *
 * Written as a predicate rather than a comment so that it is a test rather
 * than an intention: `tests/automation-token.test.mts` runs every id in
 * {@link AUTOMATION_SCOPES} through it, so adding `transactions:sign` to
 * the list above fails the suite instead of shipping.
 */
const SCOPE_NEVER =
  /(^|[:_-])(sign|transact|transfer|withdraw|release|settle|spend|pay|fund|escrow|dispute|approve|custody|key|seed|mnemonic)([:_-]|$)/i;

export function scopeIsForbidden(id: string): boolean {
  return SCOPE_NEVER.test(id);
}

/** The longest an automation token may live. */
export const MAX_TOKEN_DAYS = 90;

/** What the mint form offers, longest last. */
export const TOKEN_DAY_CHOICES = [1, 7, 30, MAX_TOKEN_DAYS] as const;

export const DEFAULT_TOKEN_DAYS = 30;

/** The most tokens one wallet may hold at once, so a leak has a bounded blast radius. */
export const MAX_TOKENS_PER_OWNER = 10;

/** Whether a string could be one of ours, before it is hashed and looked up. */
export function looksLikeAutomationToken(value: string): boolean {
  return value.startsWith(TOKEN_PREFIX) && /^[A-Za-z0-9_-]{32,96}$/.test(value.slice(TOKEN_PREFIX.length));
}

/**
 * The token in an `Authorization` header, or null.
 *
 * Bearer only, and nothing else is read: no query parameter and no cookie.
 * A credential in a URL ends up in access logs, proxy logs and browser
 * history, and a credential read from a cookie would make this token
 * usable by a cross-site form post, which is exactly the property the
 * httpOnly session has and this must not copy.
 */
export function automationTokenFromHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  return looksLikeAutomationToken(match[1]) ? match[1] : null;
}

/** The scopes asked for, de-duplicated and in the order they are declared; null if any is unknown. */
export function readScopes(raw: unknown): AutomationScope[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const asked = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string' || !SCOPE_IDS.has(value)) return null;
    asked.add(value);
  }
  return AUTOMATION_SCOPES.filter((s) => asked.has(s.id)).map((s) => s.id);
}

/**
 * Why a token may not be used for this tool, or null.
 *
 * Returns the reason rather than a boolean because the assistant has to be
 * able to tell its user what to re-mint: "missing a scope" and "expired"
 * and "revoked" are three different things to do about it, and a bare
 * `false` made all three read as "your token is wrong".
 */
export function scopeRefusal(granted: readonly string[], needed: AutomationScope | null): string | null {
  if (!needed) return null;
  if (granted.includes(needed)) return null;
  const scope = AUTOMATION_SCOPES.find((s) => s.id === needed);
  return `This automation token does not carry the ${needed} scope, so Pokter will not ${
    scope ? scope.what.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.$/, '') : needed
  }. Mint a token with that scope at /build/automation; an existing token's scopes are never widened.`;
}

export function expiryFromDays(days: number, from: Date = new Date()): string | null {
  if (!Number.isInteger(days) || days < 1 || days > MAX_TOKEN_DAYS) return null;
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

/**
 * How a listing describes a token's state, in the words the page shows.
 *
 * One function, so the page cannot call a token live that the API refuses.
 * The ordering is deliberate: a revoked token that has also expired is
 * "Revoked", because that is the fact the builder acted on.
 */
export function tokenState(
  token: { revokedAt: string | null; expiresAt: string },
  now: number = Date.now(),
): { label: string; live: boolean } {
  if (token.revokedAt) return { label: 'Revoked', live: false };
  if (Date.parse(token.expiresAt) <= now) return { label: 'Expired', live: false };
  return { label: 'Active', live: true };
}

/**
 * How long ago an assistant last used a token, in words.
 *
 * This is the only honest online/offline signal Pokter has. An assistant
 * runs on somebody's own machine; Pokter cannot see whether it is running,
 * only whether it has called lately. So the page says when it last called
 * and never claims it is "online".
 */
export function lastSeen(at: string | null, now: number = Date.now()): string {
  if (!at) return 'Never used';
  const ms = now - Date.parse(at);
  if (!Number.isFinite(ms)) return 'Never used';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'Last call under a minute ago';
  if (minutes < 60) return `Last call ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Last call ${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `Last call ${Math.floor(hours / 24)} days ago`;
}
