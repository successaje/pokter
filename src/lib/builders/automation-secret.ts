import { createHash, randomBytes } from 'node:crypto';

import { TOKEN_PREFIX } from './automation-token';

/**
 * The two operations on an automation token that need a cipher.
 *
 * Split out from `automation-token.ts` because the setup page is a client
 * component and imports the scope list and the lifetime choices from there.
 * With these in the same file, `node:crypto` was pulled into the browser
 * bundle and the webpack build refused it outright — which is the good
 * outcome, but a split module is better than a build that has to catch it.
 *
 * Nothing in the browser needs either of these. A secret is minted on the
 * server, shown once in a response, and compared by digest thereafter.
 */

/** Random bytes behind the prefix. 32 is what the builder session uses. */
const TOKEN_BYTES = 32;

export interface MintedToken {
  /** The secret, returned once and never stored. */
  token: string;
  /** What is stored instead. */
  tokenHash: string;
  /** The last four characters, so a listing can tell two tokens apart without holding either. */
  hint: string;
}

export function mintAutomationToken(): MintedToken {
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
  return { token, tokenHash: hashAutomationToken(token), hint: token.slice(-4) };
}

export function hashAutomationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
